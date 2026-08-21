import { getCollection, loadMovies, movieId, type Movie } from './store.js';
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
 * rescue exact-name/keyword matches.
 */
export const HYBRID_WEIGHTS = { dense: 0.7, sparse: 0.3 };
/** RRF damping constant — the standard k=60 keeps rank-1 from dominating. */
export const RRF_K = 60;

// The SPARSE channel lives entirely in this process: corpus + BM25 index are
// built once at module load. Chroma's native sparse indexes are Cloud-only,
// which is why this sidecar index exists at all.
const movies: Movie[] = loadMovies();
const movieIds = movies.map(movieId);
const sparseIndex = new Bm25Index(movies.map((movie) => movie.text));

function toChunk(id: string, text: string | null, metadata: Record<string, unknown> | null, score: number): Chunk {
  return { id, score, text, metadata };
}

/**
 * DENSE retrieval: semantic similarity via embeddings.
 * Chroma embeds the query with the same model used at ingest
 * (text-embedding-3-small), then its HNSW index returns the k nearest
 * documents by cosine distance. Finds paraphrases ("dreams within dreams" ->
 * Inception) even with zero shared words.
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

/**
 * SPARSE retrieval: exact keyword matching via the in-process BM25 index.
 * Hits carry a corpus position that maps back into the `movies` array loaded
 * above — same order the index was built with.
 */
export function searchSparse(query: string, k: number): Chunk[] {
  return sparseIndex.search(query, k).map((hit) =>
    toChunk(movieIds[hit.index], movies[hit.index].text, { ...movies[hit.index].metadata }, hit.score),
  );
}

/**
 * HYBRID retrieval: run both channels over an oversized candidate pool, then
 * RRF-fuse down to k results.
 *
 * Why the pool is bigger than k (max(3k, 10)): fusion can only promote docs
 * that BOTH channels surfaced, so each channel must look deeper than the
 * final cut or good candidates never enter the merge.
 */
export function searchHybrid(query: string, k: number): Promise<RetrievalResult> {
  const pool = Math.max(k * 3, 10);
  const dense = searchDense(query, pool);
  return dense.then((denseChunks) => {
    const sparseChunks = searchSparse(query, pool);
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
  });
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
      return { results: searchSparse(query, k) };
    case 'hybrid':
      return searchHybrid(query, k);
  }
}
