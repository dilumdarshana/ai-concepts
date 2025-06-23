import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';
// import { pipeline } from '@huggingface/transformers';
import { InferenceClient } from '@huggingface/inference'; // Call APIs

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

const embeddingModel = 'sentence-transformers/all-MiniLM-L12-v2';

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
      model: embeddingModel,
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

    // To safe guard
    if (!embeddingArray || !Array.isArray(embeddingArray)) {
      res.status(400).json({ error: 'Invalid embedding output' });
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

// Query from the database
app.post('/query', async (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    const embedding = await hf.featureExtraction({
      model: embeddingModel,
      inputs: query,
    });

    let embeddingArray;
    if (Array.isArray(embedding)) {
      if (typeof embedding[0] === 'number') {
        embeddingArray = embedding;
      } else if (Array.isArray(embedding[0])) {
        embeddingArray = embedding[0];
      }
    }

    const index = pcClient.index<{genre: string}>('my-index');

    const result = await index.query({
      topK: 1,
      vector: embeddingArray as number[],
      includeMetadata: true,
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error });
  }
});

// Chat with agent
app.post('/chat', async (req: Request, res: Response) => {
  const output = await hf.textGeneration({
    model: 'gpt2',
    inputs: 'Once upon a time',
    parameters: {
      max_new_tokens: 50,
    },
  });
});

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Express server listening on port ${PORT}`);
});
