import { ChromaClient, CloudClient, Schema, SparseVectorIndexConfig, VectorIndexConfig, type Collection } from 'chromadb';
import { OpenAIEmbeddingFunction } from '@chroma-core/openai';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COLLECTION_NAME = 'movies';

/**
 * Metadata key holding each record's BM25 sparse vector. Only used in CLOUD
 * mode: the schema declares a sparse vector index on this key, and the
 * server maintains an inverted index over the vectors we store here. Must
 * not start with '#' (reserved for system keys like #document/#embedding).
 */
export const SPARSE_KEY = 'bm25_vector';

/** Shape of one record in data/movies.json. */
export interface Movie {
  text: string;
  metadata: {
    name: string;
    year: number;
    actors: string;
    genre: string;
  };
}

// src/ -> project root, so data/movies.json resolves regardless of cwd.
const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * Loads the movie corpus. It is the single source of truth for BOTH channels:
 * dense documents get upserted into Chroma from it, and the sparse BM25 index
 * (retrieval.ts) is built in-memory over the same array — keeping the two
 * channels aligned by construction.
 */
export function loadMovies(): Movie[] {
  const raw = fs.readFileSync(path.join(projectRoot, 'data', 'movies.json'), 'utf-8');
  return JSON.parse(raw) as Movie[];
}

/**
 * Deterministic document id ("the-dark-knight-2008"). Same input always maps
 * to the same id, which makes /ingest idempotent: re-running it UPSERTS over
 * the old rows instead of duplicating them.
 */
export function movieId(movie: Movie): string {
  return `${movie.metadata.name}-${movie.metadata.year}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Dual-provider detection:
 *
 * - CLOUD  — when all three Chroma Cloud variables are set (CHROMA_API_KEY,
 *            CHROMA_TENANT, CHROMA_DATABASE). Cloud supports native sparse
 *            vector indexes and server-side Search()/Rrf, which self-hosted
 *            Chroma (1.5.9) rejects.
 * - LOCAL  — otherwise: Docker on CHROMA_URL (default localhost:8100), with
 *            BM25 + RRF implemented app-side instead.
 *
 * Both modes expose the same retrieval API; only the execution location of
 * the sparse channel differs.
 */
export function isCloudConfigured(): boolean {
  return Boolean(process.env.CHROMA_API_KEY && process.env.CHROMA_TENANT && process.env.CHROMA_DATABASE);
}

export function chromaProvider(): 'cloud' | 'local' {
  return isCloudConfigured() ? 'cloud' : 'local';
}

// Singletons for the process lifetime. `collectionPromise` caches the PROMISE
// (not the collection) so concurrent first-time callers share one resolution
// instead of racing to create the collection twice.
let client: ChromaClient | null = null;
let collectionPromise: Promise<Collection> | null = null;

/**
 * Builds the provider-appropriate client.
 *
 * Local: v3.x deprecated the old `path` option — connection details must be
 * separate host/port/ssl fields, parsed from CHROMA_URL.
 *
 * Cloud: CloudClient wraps api.trychroma.com:443 with token auth and routes
 * every request into the tenant/database from the env vars.
 */
export function getChromaClient(): ChromaClient {
  if (!client) {
    if (isCloudConfigured()) {
      client = new CloudClient({
        apiKey: process.env.CHROMA_API_KEY,
        tenant: process.env.CHROMA_TENANT,
        database: process.env.CHROMA_DATABASE,
      });
    } else {
      const url = new URL(process.env.CHROMA_URL || 'http://localhost:8100');
      client = new ChromaClient({
        host: url.hostname,
        port: Number(url.port) || 8000,
        ssl: url.protocol === 'https:',
      });
    }
  }
  return client;
}

function createEmbeddingFunction(): OpenAIEmbeddingFunction {
  return new OpenAIEmbeddingFunction({
    apiKey: process.env.OPENAI_API_KEY || '',
    modelName: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  });
}

/**
 * The DENSE channel's handle. Same cosine-space collection in both modes;
 * passing the embedding function lets Chroma embed queryTexts server-side on
 * classic query() calls.
 */
export function getCollection(): Promise<Collection> {
  if (!collectionPromise) {
    collectionPromise = getChromaClient().getOrCreateCollection({
      name: COLLECTION_NAME,
      embeddingFunction: createEmbeddingFunction(),
      metadata: { 'hnsw:space': 'cosine' },
    });
  }
  return collectionPromise;
}

/**
 * Schema used in CLOUD mode only. Two indexes:
 *
 * - VectorIndexConfig (no key): the global dense vector index over record
 *   embeddings, cosine space to match the local setup. Passing a key here is
 *   an error — the vector index is system-managed (#embedding). The OpenAI
 *   embedding function lives HERE (not at collection level): Chroma Cloud
 *   rejects a request that sets collection config and schema together.
 * - SparseVectorIndexConfig on SPARSE_KEY: inverted index over the BM25
 *   sparse vectors we place in each record's metadata. No sourceKey /
 *   embedding function attached — this project computes BM25 vectors itself
 *   (see bm25.ts) and stores them explicitly, keeping full control of the
 *   tokenization and scoring math.
 */
function cloudSchema(): Schema {
  return new Schema()
    .createIndex(new VectorIndexConfig({ space: 'cosine', embeddingFunction: createEmbeddingFunction() }))
    .createIndex(new SparseVectorIndexConfig(), SPARSE_KEY);
}

/**
 * Drop and recreate the collection — used by POST /ingest so each ingest run
 * starts from a clean slate (no stale docs from previous datasets). The
 * delete may 404 on first boot; that's expected and swallowed.
 *
 * In cloud mode the fresh collection carries the schema above; locally the
 * plain cosine-metadata collection is created as before.
 *
 * The returned handle always comes from a FRESH getOrCreateCollection round
 * trip: instances handed back by createCollection() misbehave on cloud
 * (Search API rows come back without documents), while a re-fetched instance
 * carries the full server-side state.
 */
export async function recreateCollection(): Promise<Collection> {
  const chroma = getChromaClient();
  try {
    await chroma.deleteCollection({ name: COLLECTION_NAME });
  } catch {
    // collection may not exist yet
  }
  if (isCloudConfigured()) {
    await chroma.createCollection({ name: COLLECTION_NAME, schema: cloudSchema() });
  } else {
    await chroma.createCollection({
      name: COLLECTION_NAME,
      embeddingFunction: createEmbeddingFunction(),
      metadata: { 'hnsw:space': 'cosine' },
    });
  }
  collectionPromise = null;
  return getCollection();
}
