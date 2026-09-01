/**
 * Shared types across the pipeline.
 *
 * The whole project is a plain data flow: docs -> chunks -> vectors -> query.
 * Keeping `Chunk` in one place means chunk.ts (assembly of text + metadata),
 * sparse.ts (BM25), store.ts (Qdrant upsert/query) and server.ts (routes)
 * never drift on the shape of what they exchange.
 */

/** One deterministic chunk of a source document, before any vectors. */
export interface Chunk {
  /** Stable id: `${source}::${index}` — re-ingesting never duplicates. */
  id: string;
  /** The text that actually gets embedded and handed to the LLM. */
  text: string;
  /** Content-aware context: source, heading path, section, chunk index. */
  metadata: Record<string, unknown>;
}

/** A sparse vector in Qdrant's wire format: parallel index/value arrays. */
export interface SparseVector {
  indices: number[];
  values: number[];
}

/** What comes back from every retrieval channel, normalized. */
export interface RetrievedChunk {
  id: string;
  text: string;
  metadata: Record<string, unknown>;
  /** Qdrant search score; after RRF this is the fused score. */
  score: number;
  /** Which channel(s) surfaced this chunk: 'dense' | 'sparse' | 'hybrid'. */
  channel: 'dense' | 'sparse' | 'hybrid';
}

/** The retrieval mode the /query route accepts. */
export type RetrievalMode = 'dense' | 'sparse' | 'hybrid';

/** A managed collection in Qdrant. */
export interface CollectionInfo {
  name: string;
  points: number;
  denseVectorSize: number;
  sparseConfigured: boolean;
}
