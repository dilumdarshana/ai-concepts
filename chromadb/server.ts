
import { ChromaClient } from 'chromadb';
import { OpenAIEmbeddingFunction } from '@chroma-core/openai';
import express, { Request, Response } from 'express';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Connect to your Dockerized ChromaDB server
const client = new ChromaClient({
  // here running chroma db docker container in another machine
  host: process.env.CHROMA_HOST || 'localhost', // with http, this does not work. Do not add port number as well
  tenant: process.env.CHROMA_TENANT || 'default_tenant',
  database: process.env.CHROMA_DATABASE || 'default_database',
  fetchOptions: {
   headers: {
    'Content-Type': 'application/json',
   },
  },
});

// Create OpenAI embedding function
const embedder = new OpenAIEmbeddingFunction({
  apiKey: process.env.OPENAI_API_KEY || '',
  modelName: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
});

// Express setup
const app = express();
app.use(express.json());


// Health check API
app.get('/health', async (req: Request, res: Response) => {
  try {
    const heartbeat = await client.heartbeat();
    res.json({
      status: 'healthy',
      chroma: heartbeat > 0 ? 'connected' : 'not connected',
    });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error });
  }
});

// Create a new collection
app.post('/collections', async (req: Request, res: Response) => {
  try {
    const { name, metadata } = req.body;
    const collection = await client.createCollection({
      name,
      embeddingFunction: embedder,
      metadata,
    });
    res.status(201).json({ message: `Collection ${collection.name} created` });
  } catch (error) {
    res.status(400).json({ error });``
  }
});

// Insert data into the collection
app.post('/collections/:collectionName/add', async (req: Request, res: Response) => {
  try {
    const { collectionName } = req.params;
    const { documents } = req.body;
    const collection = await client.getCollection({ name: collectionName });

    for (const document of documents) {
      const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      await collection.add({
        ids: [uniqueId],
        documents: [document.document],
        metadatas: [document.metadata],
      });
    }

    res.status(201).json({ message: `Documents inserted into collection ${collectionName}` });
  } catch (error) {
    console.log('error', error);
    res.status(400).json({ error });
  }
});

app.post('/collections/:collectionName/query', async (req: Request, res: Response) => {
  try {
    const { collectionName } = req.params;
    const { query } = req.body;
  
    const collection = await client.getCollection({ name: collectionName });

    const result = await collection.query({
      queryTexts: [query],
      nResults: 1,
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ error });
  }
});

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Express server listening on port ${PORT}`);

  // Verify Chromadb connection on startup
  try {
    const collections = await client.listCollections();
    console.log('ChromaDB connection successful. Existing collections: ', collections.length);
  } catch (error) {
    console.error('ChromaDB connection failed:', error);
    process.exit(1);
  }
});
