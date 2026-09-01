import { OpenAIEmbeddings } from '@langchain/openai';

/**
 * Dense embeddings via OpenAI. Kept in its own module so the store only
 * deals in `number[][]` and never with the provider.
 *
 * `text-embedding-3-small` produces 1536-dim vectors (matching rag-redis and
 * rag-graph); Qdrant's dense vector config is created with that size in
 * store.ts. If you swap models here, update the vector size there too.
 */
export function makeEmbeddings(): OpenAIEmbeddings {
  return new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  });
}

/** Embed a batch of texts (ingest). */
export async function embedTexts(
  emb: OpenAIEmbeddings,
  texts: string[],
): Promise<number[][]> {
  return emb.embedDocuments(texts);
}

/** Embed a single query. */
export async function embedQuery(
  emb: OpenAIEmbeddings,
  query: string,
): Promise<number[]> {
  return emb.embedQuery(query);
}
