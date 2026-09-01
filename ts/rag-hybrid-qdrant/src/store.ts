import { QdrantClient } from '@qdrant/js-client-rest';
import type {
  Chunk,
  CollectionInfo,
  RetrievedChunk,
  SparseVector,
} from './types.js';

/**
 * All Qdrant interaction lives here. The rest of the app deals with plain
 * Chunk / SparseVector / vector data and never sees the wire format.
 *
 * Collection schema:
 *   - `dense`  : named dense vector, `text-embedding-3-small` (1536), cosine.
 *   - `sparse` : named sparse vector holding our pre-computed BM25 weights.
 *                modifier 'none' because the weights already include IDF (see
 *                sparse.ts). 'idf' would double-count it.
 *
 * Hybrid retrieval uses Qdrant's Universal Query API: two prefetches (dense +
 * sparse) then a top-level `query: { rrf }` that fuses their rankings across
 * the whole collection. This replaces the hand-rolled RRF in the ChromaDB
 * `rag-hybrid` project.
 */

export const DENSE_IMAGE = 'dense';
export const SPARSE_IMAGE = 'sparse';
const DENSE_SIZE = 1536;

export function qdrantUrl(): string {
  return process.env.QDRANT_URL || 'http://localhost:6333';
}

export function makeClient(): QdrantClient {
  return new QdrantClient({ url: qdrantUrl() });
}

export function collectionName(): string {
  return process.env.COLLECTION_NAME || 'documents';
}

/** Creates (or recreates) the collection with dense + sparse vectors. */
export async function ensureCollection(
  client: QdrantClient,
  recreate: boolean,
): Promise<void> {
  const name = collectionName();
  if (recreate && (await client.collectionExists(name)).exists) {
    await client.deleteCollection(name);
  }
  if (!(await client.collectionExists(name)).exists) {
    await client.createCollection(name, {
      vectors: {
        [DENSE_IMAGE]: { size: DENSE_SIZE, distance: 'Cosine' },
      },
      sparse_vectors: {
        [SPARSE_IMAGE]: { modifier: 'none' },
      },
    });
  }
}

/** Upserts chunks (text + metadata + dense + sparse vectors) as points. */
export async function upsertChunks(
  client: QdrantClient,
  chunks: { chunk: Chunk; dense: number[]; sparse: SparseVector }[],
): Promise<void> {
  await ensureCollection(client, false);
  await client.upsert(collectionName(), {
    points: chunks.map(({ chunk, dense, sparse }, index) => ({
      // Qdrant point ids must be an unsigned integer or a UUID — not arbitrary
      // strings. We use a sequential integer id and keep the readable chunk id
      // (e.g. "vector-databases.md::2-3::BM25") in the payload instead.
      id: index,
      vector: {
        [DENSE_IMAGE]: dense,
        [SPARSE_IMAGE]: sparse,
      },
      payload: { chunkId: chunk.id, text: chunk.text, ...chunk.metadata },
    })),
  });
}

export interface QueryInput {
  dense: number[];
  sparse: SparseVector | null;
  k: number;
}

/** Runs a single Qdrant query and normalizes hits to RetrievedChunk[]. */
export async function queryCollection(
  client: QdrantClient,
  input: QueryInput,
  mode: 'dense' | 'sparse' | 'hybrid',
): Promise<{ results: RetrievedChunk[]; channels?: RetrievedChunk[][] }> {
  await ensureCollection(client, false);
  const limit = input.k * 4;

  const prefetch = [
    { query: input.dense, using: DENSE_IMAGE, limit },
    ...(input.sparse
      ? [{ query: input.sparse, using: SPARSE_IMAGE, limit }]
      : []),
  ];

  const rsp =
    mode === 'hybrid'
      ? await client.query(collectionName(), {
          prefetch,
          query: { rrf: { k: 60 } },
          limit: input.k,
          with_payload: true,
        })
      : mode === 'dense'
        ? await client.query(collectionName(), {
            query: input.dense,
            using: DENSE_IMAGE,
            limit: input.k,
            with_payload: true,
          })
        : await client.query(collectionName(), {
            query: input.sparse ?? { indices: [], values: [] },
            using: SPARSE_IMAGE,
            limit: input.k,
            with_payload: true,
          });

  const results = rsp.points.map(toRetrieved(mode));
  let channels: RetrievedChunk[][] | undefined;
  if (mode === 'hybrid') {
    // Per-channel top-k for observability, so you can see which channel(s)
    // surfaced each chunk before RRF fused them.
    const [dense, sparse] = await Promise.all([
      client.query(collectionName(), {
        query: input.dense,
        using: DENSE_IMAGE,
        limit: input.k,
        with_payload: true,
      }),
      input.sparse
        ? client.query(collectionName(), {
            query: input.sparse,
            using: SPARSE_IMAGE,
            limit: input.k,
            with_payload: true,
          })
        : Promise.resolve({ points: [] }),
    ]);
    channels = [
      dense.points.map(toRetrieved('dense')),
      sparse.points.map(toRetrieved('sparse')),
    ];
  }
  return { results, channels };
}

/** Normalizes a Qdrant point into a RetrievedChunk. */
function toRetrieved(channel: 'dense' | 'sparse' | 'hybrid') {
  return (point: {
    id: string | number;
    score: number;
    payload?: Record<string, unknown> | null;
  }): RetrievedChunk => {
    const payload = (point.payload ?? {}) as Record<string, unknown>;
    return {
      id: String(payload.chunkId ?? point.id),
      text: String(payload.text ?? ''),
      metadata: Object.fromEntries(
        Object.entries(payload).filter(
          ([k]) => k !== 'text' && k !== 'chunkId',
        ),
      ),
      score: point.score,
      channel,
    };
  };
}

/** Number of points currently in the collection (used by /health). */
export async function countPoints(client: QdrantClient): Promise<number> {
  await ensureCollection(client, false);
  const res = await client.count(collectionName(), { exact: true });
  return res.count;
}

/** Deletes the whole collection. */
export async function dropCollection(client: QdrantClient): Promise<void> {
  const name = collectionName();
  if ((await client.collectionExists(name)).exists) {
    await client.deleteCollection(name);
  }
}

/** Reports the collection config for /health. */
export async function collectionInfo(
  client: QdrantClient,
): Promise<CollectionInfo> {
  const name = collectionName();
  const exists = (await client.collectionExists(name)).exists;
  return {
    name,
    points: exists ? await countPoints(client) : 0,
    denseVectorSize: DENSE_SIZE,
    sparseConfigured: exists,
  };
}
