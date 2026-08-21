import { ChromaClient, type Collection } from 'chromadb';
import { OpenAIEmbeddingFunction } from '@chroma-core/openai';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COLLECTION_NAME = 'movies';

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

// Singletons for the process lifetime. `collectionPromise` caches the PROMISE
// (not the collection) so concurrent first-time callers share one resolution
// instead of racing to create the collection twice.
let client: ChromaClient | null = null;
let collectionPromise: Promise<Collection> | null = null;

/**
 * Chroma HTTP client. v3.x deprecated the old `path` option — connection
 * details must be passed as separate host/port/ssl fields, parsed here from
 * CHROMA_URL (default http://localhost:8100, matching docker-compose.yml).
 */
export function getChromaClient(): ChromaClient {
  if (!client) {
    const url = new URL(process.env.CHROMA_URL || 'http://localhost:8100');
    client = new ChromaClient({
      host: url.hostname,
      port: Number(url.port) || 8000,
      ssl: url.protocol === 'https:',
    });
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
 * The DENSE channel's handle: get-or-create "movies" configured with cosine
 * distance (hnsw:space). Passing the embedding function lets Chroma embed
 * queryTexts server-side on every query() call.
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
 * Drop and recreate the collection — used by POST /ingest so each ingest run
 * starts from a clean slate (no stale docs from previous datasets). The
 * delete may 404 on first boot; that's expected and swallowed.
 */
export async function recreateCollection(): Promise<Collection> {
  const chroma = getChromaClient();
  try {
    await chroma.deleteCollection({ name: COLLECTION_NAME });
  } catch {
    // collection may not exist yet
  }
  collectionPromise = chroma.createCollection({
    name: COLLECTION_NAME,
    embeddingFunction: createEmbeddingFunction(),
    metadata: { 'hnsw:space': 'cosine' },
  });
  return collectionPromise;
}
