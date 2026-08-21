import { tokenize } from './tokenize.js';

/**
 * Wire format Chroma expects for a sparse vector: parallel arrays of
 * dimension indices and their weights. This is what gets stored in the
 * collection's sparse-indexed metadata key (cloud mode) — the server builds
 * an inverted index over these vectors and answers KNN queries natively.
 */
export interface SparseVector {
  indices: number[];
  values: number[];
}

/**
 * BM25 tuning parameters (the classic defaults):
 *
 * K1 = 1.2 — term-frequency saturation. Controls how quickly a term stops
 *            gaining score as it repeats in a document. Without saturation a
 *            doc mentioning "train" 50x would crush one mentioning it 3x.
 * B  = 0.75 — length normalization strength. 0 = ignore document length,
 *            1 = fully normalize against the corpus average. 0.75 is the
 *            standard middle ground.
 */
const K1 = 1.2;
const B = 0.75;

/**
 * One sparse search hit: the document's position in the corpus (index into
 * the array the index was built from) and its BM25 relevance score.
 */
export interface SparseHit {
  index: number;
  score: number;
}

/**
 * A hand-rolled BM25 index — the "sparse" channel of hybrid retrieval.
 *
 * Why hand-rolled? Chroma's native sparse indexes / Search() / Rrf API are
 * Chroma Cloud-only; self-hosted 1.5.9 rejects them ("Sparse vector indexing
 * is not enabled in local"). The math below is the same BM25 that engines
 * like Elasticsearch/Lucene run, just executed in-process.
 *
 * How it works:
 *   1. At construction, every document becomes a SPARSE VECTOR: a map of
 *      {vocabularyIndex -> weight} containing only terms that appear in the
 *      doc (most of the vocabulary is absent — hence "sparse").
 *   2. Each weight = IDF(term) x TF-saturation(length-normalized).
 *   3. search() builds the same kind of vector for the query and scores each
 *      document with a dot product over shared terms.
 *
 * Unlike dense embeddings, these vectors are computed with COUNTABLE,
 * interpretable statistics — no neural network involved.
 */
export class Bm25Index {
  /** term string -> dense integer id used as the vector dimension key */
  private readonly vocab: Map<string, number>;
  /** vocab id -> inverse document frequency (rarity of the term) */
  private readonly idf: Map<number, number>;
  /** average token count per document, used for length normalization */
  private readonly avgLen: number;
  /** one sparse vector per document, aligned with the input array order */
  private readonly docVectors: Map<number, number>[];

  /**
   * Precomputes all corpus statistics up front so queries are pure lookups:
   *   - document frequency per term (in how many docs does the term appear)
   *   - IDF per term
   *   - a weighted sparse vector per document
   */
  constructor(documents: string[]) {
    const tokenized = documents.map(tokenize);
    const totalDocs = tokenized.length;
    const docFreq = new Map<string, number>();
    let totalLen = 0;

    for (const tokens of tokenized) {
      totalLen += tokens.length;
      // new Set(tokens): count each term once per DOCUMENT (doc frequency),
      // not once per occurrence (that would be term frequency).
      for (const term of new Set(tokens)) {
        docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
      }
    }

    this.vocab = new Map();
    for (const term of docFreq.keys()) {
      this.vocab.set(term, this.vocab.size);
    }

    this.avgLen = totalDocs > 0 ? totalLen / totalDocs : 1;

    // Okapi IDF: log(1 + (N - df + 0.5) / (df + 0.5))
    // Common terms -> ~0 weight; rare terms -> large weight. The +1 inside
    // the log keeps everything non-negative.
    this.idf = new Map();
    for (const [term, freq] of docFreq) {
      this.idf.set(this.vocab.get(term)!, Math.log(1 + (totalDocs - freq + 0.5) / (freq + 0.5)));
    }

    this.docVectors = tokenized.map((tokens) => this.weightTokens(tokens));
  }

  /**
   * Turns a token list into a sparse BM25 weight vector.
   *
   * Per term:  IDF x [ tf x (K1+1) ] / [ tf + K1 x (1 - B + B x len/avgLen) ]
   *            \___/   \________________ TF saturation + length norm ______/
   *           rarity
   * The numerator's (K1+1) makes TF grow saturatingly, not linearly; the
   * denominator's len/avgLen factor penalizes long documents.
   */
  private weightTokens(tokens: string[]): Map<number, number> {
    const termFreq = new Map<string, number>();
    for (const term of tokens) {
      termFreq.set(term, (termFreq.get(term) ?? 0) + 1);
    }

    const weights = new Map<number, number>();
    for (const [term, freq] of termFreq) {
      const index = this.vocab.get(term);
      if (index === undefined) continue;
      const lengthNorm =
        (freq * (K1 + 1)) / (freq + K1 * (1 - B + B * (tokens.length / this.avgLen)));
      weights.set(index, (weights.get(index) ?? 0) + (this.idf.get(index) ?? 0) * lengthNorm);
    }
    return weights;
  }

  private queryVector(query: string): Map<number, number> {
    return this.weightTokens(tokenize(query));
  }

  /**
   * Converts an internal sparse weight map into Chroma's SparseVector wire
   * format. Entries are emitted in ASCENDING index order — the wire format
   * (and Chroma Cloud's validation) expects sorted indices, but Map iteration
   * follows token-occurrence order, so an explicit sort is required.
   */
  private toSparseVector(weights: Map<number, number>): SparseVector {
    return {
      indices: [...weights.keys()].sort((a, b) => a - b),
      values: [...weights.keys()].sort((a, b) => a - b).map((index) => weights.get(index)!),
    };
  }

  /**
   * Precomputed sparse vectors for every corpus document, in the same order
   * the index was constructed. Used at ingest: cloud mode stores one per
   * record in the sparse-indexed metadata key.
   */
  docSparseVectors(): SparseVector[] {
    return this.docVectors.map((vector) => this.toSparseVector(vector));
  }

  /**
   * Embeds a query into the same vector space as docSparseVectors(). Terms
   * unknown to the corpus vocabulary are dropped (they have no IDF and no
   * document could match them anyway). Returns null when nothing overlaps.
   */
  querySparseVector(query: string): SparseVector | null {
    const qvec = this.queryVector(query);
    return qvec.size > 0 ? this.toSparseVector(qvec) : null;
  }

  /**
   * Scores every document by dot product between query and document vectors.
   * Only SHARED dimensions contribute — a term absent from both sides adds
   * nothing. This exact-term matching is what makes the sparse channel nail
   * names/keywords that semantic search can miss ("Unstoppable", actor names).
   *
   * Returns at most k hits, best first. Documents with zero overlap are omitted.
   */
  search(query: string, k: number): SparseHit[] {
    const qvec = this.queryVector(query);
    if (qvec.size === 0) return [];

    const hits: SparseHit[] = [];
    for (let i = 0; i < this.docVectors.length; i++) {
      let score = 0;
      for (const [termIdx, qWeight] of qvec) {
        const dWeight = this.docVectors[i].get(termIdx);
        if (dWeight !== undefined) score += qWeight * dWeight;
      }
      if (score > 0) hits.push({ index: i, score });
    }

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, k);
  }
}
