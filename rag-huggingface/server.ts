import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { Pinecone, PineconeRecord } from '@pinecone-database/pinecone';
// import { pipeline } from '@huggingface/transformers';
import { InferenceClient } from '@huggingface/inference';

// Load environment variables from .env file
dotenv.config();

// Connect with Pinecone
const pcClient = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY || '',
});

// Create Huggingface embedding function
const hf = new InferenceClient(process.env.HUGGINGFACE_TOKEN || '');

// Express setup
const app = express();
app.use(express.json());

app.post('/create-index', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    await pcClient.createIndex({
      name,
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1',
        },
      },
      dimension: 384,
    });
    res.status(201).json({ message: `Pinecone index ${name} created` });
  } catch (error) {
    res.status(400).json({ error });
  }
});

// Create a record in Pinecone
app.post('/embeddings', async (req: Request, res: Response) => {
  try {
    const { text = 'Sample input' } = req.body;
    const embedding = await hf.featureExtraction({
      model: 'sentence-transformers/all-MiniLM-L12-v2',
      inputs: text,
    });

    // Normalize embedding to number array
    let embeddingArray;
    if (Array.isArray(embedding)) {
      if (typeof embedding[0] === 'number') {
        embeddingArray = embedding;
      } else if (Array.isArray(embedding[0])) {
        embeddingArray = embedding[0]; // Take first result for single input
      }
    }

    const index = pcClient.index<{ genre: string }>('my-index');

    await index.upsert([{
      id: '123',
      values: embeddingArray as number[],
      metadata: {
        genre: 'action',
      }
    }]);
    res.status(201).json({ message: `Record created`, embedding });
  } catch (error) {
    res.status(400).json({ error });
  }
});

// Insert data into the collection
app.post('/collections/:collectionName/add', async (req: Request, res: Response) => {
  // try {
  //   const { collectionName } = req.params;
  //   const { documents } = req.body;
  //   const collection = await client.getCollection({ name: collectionName });

  //   for (const document of documents) {
  //     const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  //     await collection.add({
  //       ids: [uniqueId],
  //       documents: [document.document],
  //       metadatas: [document.metadata],
  //     });
  //   }

  //   res.status(201).json({ message: `Documents inserted into collection ${collectionName}` });
  // } catch (error) {
  //   console.log('error', error);
  //   res.status(400).json({ error });
  // }
});

// Query the collection
app.post('/collections/:collectionName/query', async (req: Request, res: Response) => {
  // try {
  //   const { collectionName } = req.params;
  //   const { query } = req.body;
  
  //   const collection = await client.getCollection({ name: collectionName });

  //   const result = await collection.query({
  //     queryTexts: [query],
  //     nResults: 1,
  //   });

  //   res.json(result);
  // } catch (error) {
  //   res.status(400).json({ error });
  // }
});

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Express server listening on port ${PORT}`);

  // Verify Chromadb connection on startup
  // try {
  //   const collections = await client.listCollections();
  //   console.log('ChromaDB connection successful. Existing collections: ', collections.length);
  // } catch (error) {
  //   console.error('ChromaDB connection failed:', error);
  //   process.exit(1);
  // }
});
