
import { ChromaClient } from 'chromadb';
import { OpenAIEmbeddingFunction } from '@chroma-core/openai';

// Connect to your Dockerized ChromaDB server
const client = new ChromaClient({
  host: 'http://192.168.1.8:8000',
  tenant: 'default_tenant',
  database: 'default_database',
});

// Create OpenAI embedding function
const embedder = new OpenAIEmbeddingFunction({
  apiKey: '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',
  modelName: 'text-embedding-3-small' // or "text-embedding-ada-002"
});


async function main() {
  const collections = await client.countCollections();

  console.log('xxxx', collections)
  // const collection = await client.createCollection({
  //   name: 'test-from-js',
  //   embeddingFunction: embedder,
  // });
  // const heartbeat = await client.heartbeat();
  // console.log('ChromaDB connection successful:', heartbeat);
}

main();
