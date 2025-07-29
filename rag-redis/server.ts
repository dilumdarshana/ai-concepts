import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { InferenceClient } from '@huggingface/inference'; // Call APIs
import {
  createClient,
} from 'redis';
import { SCHEMA_FIELD_TYPE } from '@redis/search';
import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOpenAI } from '@langchain/openai';

interface MovieData {
  text: string;
  metadata: {
    name: string;
    year: number;
    text: string;
  };
}

// Load environment variables from .env file
dotenv.config();

// Create Huggingface embedding function
const hf = new InferenceClient(process.env.HUGGINGFACE_TOKEN || '');

// Create Redis client
const client = createClient({
  username: 'default',
  password: 'OSI7IeBSEDx1vOkebtmvczQKBq3lpbm0',
  socket: {
    host: 'redis-19632.c309.us-east-2-1.ec2.redns.redis-cloud.com',
    port: 19632
  }
});

client.on('error', err => console.log('Redis Client Error', err));

// Express setup
const app = express();
app.use(express.json());

// Free embedding model
const embeddingModel = 'sentence-transformers/all-MiniLM-L12-v2';

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    // Generate embedding vector
    const embedding = await hf.featureExtraction({
      model: embeddingModel,
      inputs: text,
    });

    // Handle different return formats from HF
    let embeddingArray: number[];

    if (Array.isArray(embedding)) {
      if (Array.isArray(embedding[0])) {
        // If it's a 2D array (batch of embeddings), take the first one
        embeddingArray = embedding[0] as number[];
      } else {
        // If it's a 1D array
        embeddingArray = embedding as number[];
      }
    } else {
      throw new Error('Unexpected embedding format from Hugging Face');
    }

    return embeddingArray;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

// Create a index
app.post('/create-index', async (req: Request, res: Response) => {
  try {
    await client.ft.create('idx:movies_json', {
      // Access nested fields using JSONPath
      '$.text': {
        type: SCHEMA_FIELD_TYPE.TEXT,
        AS: 'text' // Alias for easier querying
      },
      '$.metadata.name': {
        type: SCHEMA_FIELD_TYPE.TEXT,
        AS: 'name',
        SORTABLE: true
      },
      '$.metadata.year': {
        type: SCHEMA_FIELD_TYPE.NUMERIC,
        AS: 'year',
        SORTABLE: true
      },
      // Extract genre from text (you'd need to store it separately for indexing)
      '$.genre': {
        type: SCHEMA_FIELD_TYPE.TAG,
        AS: 'genre'
      },
      '$.actors': {
        type: SCHEMA_FIELD_TYPE.TEXT,
        AS: 'actors'
      },
      '$.embedding': {
        type: SCHEMA_FIELD_TYPE.VECTOR,
        TYPE: 'FLOAT32',
        ALGORITHM: 'HNSW',
        DISTANCE_METRIC: 'COSINE',
        DIM: 384,
        AS: 'embedding'
      }
    }, {
      ON: 'JSON',
      PREFIX: 'movie:'
    });
    res.status(201).json('JSON movie index created successfully');
  } catch (error) {
    console.log('Error', error);
    res.status(400).json({ error });
  }
});

app.post('/store-embeddings', async (req: Request, res: Response) => {
  const { text, metadata } = req.body;

  try {
    const embeddingArray = await generateEmbedding(text);

    const movieId = `${metadata.name.toLowerCase().replace(/\s+/g, '_')}_${metadata.year}`;
    const key = `movie:${movieId}`;

    const document = {
      metadata,
      genre: metadata.genre || 'Unknown',
      actors: metadata.actors || 'Unknown',
      embedding: embeddingArray // Store as array in JSON
    };

    // Store as JSON document
    await client.json.set(key, '$', document);

    res.status(201).json({ message: `Record created` });
  } catch (error) {
    console.log('Error', error);
    res.status(400).json({ error });
  }
});

app.post('/query', async (req: Request, res: Response) => {
  const { query } = req.body;

  try {
    const queryEmbedding = await generateEmbedding(query);

    // Convert to buffer for Redis
    const queryBuffer = Buffer.from(new Float32Array(queryEmbedding).buffer);

    const results = await client.ft.search(
      'idx:movies_json',
      '*=>[KNN 10 @embedding $query_vec]', {
      PARAMS: {
        'query_vec': queryBuffer
      },
      LIMIT: {
        from: 0,
        size: 10,
      },
      RETURN: ['name', 'year', 'text', 'genre', 'actors', '__embedding_score']
    });

    res.status(200).json({ results });
  } catch (error) {
    console.log('Error', error);
    res.status(400).json({ error });
  }
});

app.post('/flush-db', async (req: Request, res: Response) => {
  try {
    await client.flushDb();
    console.log('All data removed from current Redis database');
  } catch (error) {
    console.error('Error flushing current database:', error);
  }
});

app.get('/index', async (req: Request, res: Response) => {
  try {
    const indexes = await client.ft._list();

    res.status(200).json({ indexes });
  } catch (error) {
    console.log('No search indexes found or RediSearch not available');
  }
});

app.get('/index/:name', async (req: Request, res: Response) => {
  const index = req.params.name;

  try {
    const indexInfo = await client.ft.info(index);
    res.status(200).json({ indexInfo });
  } catch (error) {
    console.log(`Could not get info for index ${index}`);
  }
});

app.post('/records', async (req: Request, res: Response) => {
  const { index } = req.body;

  try {
    const records = await client.ft.search(index, '*', {
      LIMIT: {
        from: 0,
        size: 10,
      },
      RETURN: ['name', 'year', 'text', 'genre', 'actors']
    });

    res.status(200).json({ records });
  } catch (error) {
    console.log('Error fetching records:', error);
    res.status(400).json({ error });
  }
});

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await client.connect();
  console.log(`Express server listening on port ${PORT}`);
});
