import { Knn, Rrf, Search, type SearchResultRow } from 'chromadb';
import { getCollection, isCloudConfigured, loadMovies, movieId, SPARSE_KEY, type Movie } from './store.js';
import { Bm25Index } from './bm25.js';
import { rrfFuse } from './fusion.js';

/** Which retrieval channel(s) to use for a query. */
export type RetrievalMode = 'dense' | 'sparse' | 'hybrid';

/**
 * Normalized search result used across all channels, so fusion/rerank/LLM
 * code never cares where a chunk came from.
 *
 * `score` is channel-dependent: cosine DISTANCE for dense (lower = closer),
 * BM25 relevance for sparse (higher = better), fused RRF score for hybrid.
 */
export interface Chunk {
  id: string;
  score: number;
  text: string | null;
  metadata: Record<string, unknown> | null;
}

export interface RetrievalResult {
  results: Chunk[];
  /** Only set for hybrid mode: what each channel returned BEFORE fusion. */
  channels?: { dense: Chunk[]; sparse: Chunk[] };
}

/**
 * How much each channel counts during RRF fusion. Dense is weighted higher
 * because semantic similarity generalizes better; sparse stays in the mix to
 * rescue exact-name/keyword matches. The same weights are passed to Chroma
 * Cloud's native Rrf() in cloud mode, keeping both modes comparable.
 */
export const HYBRID_WEIGHTS = { dense: 0.7, sparse: 0.3 };
/** RRF damping constant — the standard k=60 keeps rank-1 from dominating. */
export const RRF_K = 60;

// The BM25 index is built once at module load and serves BOTH providers:
// - LOCAL mode: it IS the sparse channel (in-process dot-product scoring).
// - CLOUD mode: it produces the sparse vectors stored per-record at ingest
//   and embeds queries into that same vector space at search time.
const movies: Movie[] = loadMovies();
const movieIds = movies.map(movieId);
const sparseIndex = new Bm25Index(movies.map((movie) => movie.text));

/**
 * Precomputed BM25 sparse vector per corpus document (corpus order). Used by
 * the server's /ingest handler in CLOUD mode: one vector goes into each
 * record's metadata under SPARSE_KEY so Chroma Cloud can index it.
 */
export function docSparseVectors() {
  return sparseIndex.docSparseVectors();
}

function toChunk(id: string, text: string | null, metadata: Record<string, unknown> | null, score: number): Chunk {
  return { id, score, text, metadata };
}

/**
 * DENSE retrieval: semantic similarity via embeddings. Identical request in
 * both provider modes — the classic query() API works against local Docker
 * and Chroma Cloud alike. Chroma embeds the query with the same model used
 * at ingest (text-embedding-3-small), then the HNSW index returns the k
 * nearest documents by cosine distance. Finds paraphrases ("dreams within
 * dreams" -> Inception) even with zero shared words.
 */
export async function searchDense(query: string, k: number): Promise<Chunk[]> {
  const collection = await getCollection();
  const result = await collection.query({
    queryTexts: [query],
    nResults: k,
    include: ['documents', 'metadatas', 'distances'],
  });
  // Chroma returns one result array per query text; we always send exactly one.
  return (result.ids[0] ?? []).map((id, i) =>
    toChunk(
      id,
      result.documents?.[0]?.[i] ?? null,
      (result.metadatas?.[0]?.[i] as Record<string, unknown> | null) ?? null,
      result.distances?.[0]?.[i] ?? 0,
    ),
  );
}

/** Maps a Search API row into the provider-neutral Chunk shape. */
function rowToChunk(row: SearchResultRow): Chunk {
  return toChunk(row.id, row.document ?? null, (row.metadata as Record<string, unknown> | null) ?? null, row.score ?? 0);
}

/**
 * SPARSE retrieval.
 *
 * LOCAL mode: exact keyword scoring via the in-process BM25 index — pure
 * Node dot products over precomputed document vectors.
 *
 * CLOUD mode: the same BM25 math produces the QUERY vector, but matching
 * happens server-side — Knn({ query: sparseVector }) hits the inverted
 * index Chroma Cloud maintains over the vectors stored under SPARSE_KEY.
 * This is the piece self-hosted Chroma cannot do ("Sparse vector indexing
 * is not enabled in local").
 */
export async function searchSparse(query: string, k: number): Promise<Chunk[]> {
  if (isCloudConfigured()) {
    const queryVector = sparseIndex.querySparseVector(query);
    if (!queryVector) return [];
    const collection = await getCollection();
    const result = await collection.search(
      new Search()
        .rank(Knn({ query: queryVector, key: SPARSE_KEY, limit: Math.max(k * 3, 10) }))
        .limit(k)
        .selectAll(),
    );
    // The Search API scores distances (lower = more relevant); negate so the
    // sparse channel keeps its local-mode contract of higher = better.
    return (result.rows()[0] ?? []).map((row) => {
      const chunk = rowToChunk(row);
      return { ...chunk, score: -chunk.score };
    });
  }
  return sparseIndex.search(query, k).map((hit) =>
    toChunk(movieIds[hit.index], movies[hit.index].text, { ...movies[hit.index].metadata }, hit.score),
  );
}

/**
 * HYBRID retrieval: run both channels over an oversized candidate pool, then
 * fuse down to k results.
 *
 * Why the pool is bigger than k (max(3k, 10)): fusion can only promote docs
 * that BOTH channels surfaced, so each channel must look deeper than the
 * final cut or good candidates never enter the merge.
 *
 * LOCAL mode: RRF runs app-side (fusion.ts) over the two channel lists.
 *
 * CLOUD mode: ONE server-side search — Rrf() fuses a dense Knn (string query
 * embedded by the collection's embedding function) with a sparse Knn (our
 * BM25 query vector), using the same weights/k constants as the local path.
 * The per-channel breakdown comes from two extra parallel searches so the
 * API response shape stays identical across modes.
 */
export async function searchHybrid(query: string, k: number): Promise<RetrievalResult> {
  const pool = Math.max(k * 3, 10);

  if (isCloudConfigured()) {
    const queryVector = sparseIndex.querySparseVector(query);
    const collection = await getCollection();
    const fusedSearch = queryVector
      ? collection
          .search(
            new Search()
              .rank(
                Rrf({
                  ranks: [
                    Knn({ query, limit: pool }),
                    Knn({ query: queryVector, key: SPARSE_KEY, limit: pool }),
                  ],
                  k: RRF_K,
                  weights: [HYBRID_WEIGHTS.dense, HYBRID_WEIGHTS.sparse],
                }),
              )
              .limit(k)
              .selectAll(),
          )
          .then((result) => (result.rows()[0] ?? []).map(rowToChunk))
      : Promise.resolve<Chunk[]>([]);
    const [denseChunks, sparseChunks, fusedRows] = await Promise.all([
      searchDense(query, pool),
      searchSparse(query, pool),
      fusedSearch,
    ]);
    // Rebuild per-chunk channel tags (local mode gets them from rrfFuse):
    // a fused chunk is tagged with every top-k channel list that contains it.
    const denseIds = new Set(denseChunks.slice(0, k).map((chunk) => chunk.id));
    const sparseIds = new Set(sparseChunks.slice(0, k).map((chunk) => chunk.id));
    const fused = fusedRows.map((chunk) => {
      return {
        ...chunk,
        score: -chunk.score,
        channels: [
          ...(denseIds.has(chunk.id) ? ['dense'] : []),
          ...(sparseIds.has(chunk.id) ? ['sparse'] : []),
        ],
      };
    });
    return { results: fused, channels: { dense: denseChunks.slice(0, k), sparse: sparseChunks.slice(0, k) } };
  }

  const denseChunks = await searchDense(query, pool);
  const sparseChunks = sparseIndex.search(query, pool).map((hit) =>
    toChunk(movieIds[hit.index], movies[hit.index].text, { ...movies[hit.index].metadata }, hit.score),
  );
  const fused = rrfFuse(
    [
      { name: 'dense', chunks: denseChunks, weight: HYBRID_WEIGHTS.dense },
      { name: 'sparse', chunks: sparseChunks, weight: HYBRID_WEIGHTS.sparse },
    ],
    RRF_K,
  ).slice(0, k);
  // Per-channel top-k is included for observability — it lets API callers
  // see exactly what fusion had to work with.
  return { results: fused, channels: { dense: denseChunks.slice(0, k), sparse: sparseChunks.slice(0, k) } };
}

/**
 * Entry point used by the server: dispatch on mode and normalize the shape.
 */
export async function retrieve(
  query: string,
  mode: RetrievalMode,
  k: number,
): Promise<RetrievalResult> {
  switch (mode) {
    case 'dense':
      return { results: await searchDense(query, k) };
    case 'sparse':
      return { results: await searchSparse(query, k) };
    case 'hybrid':
      return searchHybrid(query, k);
  }
}
