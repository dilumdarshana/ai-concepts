import type { SparseVector } from './types.js';

/**
 * The sparse channel of hybrid retrieval — BM25 over a fixed batch of texts.
 *
 * Unlike dense embeddings (a neural network), BM25 is pure, countable
 * statistics:
 *   - IDF: a term that appears in few documents is more discriminative.
 *   - TF saturation + length normalization: a term's weight climbs fast then
 *     flattens, and long documents are penalized so a keyword hiding in a
 *     500-line chunk doesn't look as important as one in a terse snippet.
 *
 * We only need to build this at ingest time (we have every chunk text then),
 * which lets us compute corpus-aware IDF and average length. At query time we
 * build a sparse vector in the SAME vocabulary and let Qdrant score it.
 *
 * The resulting vectors are stored under a Qdrant sparse vector with
 * `modifier: 'none'` (see store.ts) so the exact BM25 weights above are used
 * verbatim rather than being re-IDF'd by Qdrant.
 */

const K1 = 1.2;
const B = 0.75;

export interface Bm25Index {
  /** One sparse vector per input text, aligned with the order given. */
  vectors: SparseVector[];
  /** Builds the query's sparse vector in the same vocabulary (may be null). */
  query: (query: string) => SparseVector | null;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Builds a BM25 sparse index over `texts`. */
export function buildBm25(texts: string[]): Bm25Index {
  const tokenized = texts.map(tokenize);
  const totalDocs = tokenized.length;
  let totalLen = 0;
  const docFreq = new Map<string, number>();

  for (const tokens of tokenized) {
    totalLen += tokens.length;
    for (const term of new Set(tokens)) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  // vocab is part of the returned tokens. Terms not in the vocabulary never
  // match anything, so we can drop them at query time without losing recall.
  const termId = new Map<string, number>();
  for (const term of docFreq.keys()) termId.set(term, termId.size);

  const avgLen = totalDocs > 0 ? totalLen / totalDocs : 1;
  const idf = new Map<number, number>();
  for (const [term, freq] of docFreq) {
    // Okapi IDF: log(1 + (N - df + 0.5) / (df + 0.5)). Never negative.
    idf.set(
      termId.get(term)!,
      Math.log(1 + (totalDocs - freq + 0.5) / (freq + 0.5)),
    );
  }

  const vectors = tokenized.map((tokens) =>
    toSparse(weightTokens(tokens, avgLen, termId, idf)),
  );

  return {
    vectors,
    query: (query) => {
      const qvec = weightTokens(tokenize(query), avgLen, termId, idf);
      return qvec.size > 0 ? toSparse(qvec) : null;
    },
  };
}

/**
 * Per-term weight:  IDF x [ tf x (K1+1) ] / [ tf + K1 x (1 - B + B x len/avgLen) ]
 *                   \_/   \_______ TF saturation + length normalization ____/
 */
function weightTokens(
  tokens: string[],
  avgLen: number,
  termId: Map<string, number>,
  idf: Map<number, number>,
): Map<number, number> {
  const termFreq = new Map<string, number>();
  for (const term of tokens) termFreq.set(term, (termFreq.get(term) ?? 0) + 1);

  const weights = new Map<number, number>();
  for (const [term, freq] of termFreq) {
    const index = termId.get(term);
    if (index === undefined) continue;
    const lengthNorm =
      (freq * (K1 + 1)) / (freq + K1 * (1 - B + B * (tokens.length / avgLen)));
    weights.set(
      index,
      (weights.get(index) ?? 0) + (idf.get(index) ?? 0) * lengthNorm,
    );
  }
  return weights;
}

/** Converts an internal {dimension -> weight} map into Qdrant's wire format. */
function toSparse(weights: Map<number, number>): SparseVector {
  const sorted = [...weights.keys()].sort((a, b) => a - b);
  return {
    indices: sorted,
    values: sorted.map((index) => weights.get(index)!),
  };
}
