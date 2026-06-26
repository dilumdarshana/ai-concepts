// Import necessary modules and libraries
import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { InferenceClient } from '@huggingface/inference'; // Hugging Face API client
import { createClient } from 'redis';
import { SCHEMA_FIELD_TYPE } from '@redis/search';
import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

// Typescript type for Redis response
type RedisResponse = {
  total: number;
  documents: {
    id: string;
    value: Record<string, unknown>;
  }[];
};

// Load environment variables from the .env file
dotenv.config();

// Initialize Hugging Face embedding client
const hf = new InferenceClient(process.env.HUGGINGFACE_TOKEN || '');

// Define embedding models
const freeEmbeddingModel = 'sentence-transformers/all-MiniLM-L12-v2'; // 384 dimensions
const openAiEmbeddingModel = 'text-embedding-3-small'; // 1536 dimensions

// Create a Redis client with credentials and connection details
const client = createClient({
  username: process.env.REDIS_USERNAME || 'default',
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
  },
});

// Initialize the ChatOpenAI model with API key and configuration
const chtModel = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o',
  temperature: 0.7,
});

// Handle Redis client errors
client.on('error', (err) => console.log('Redis Client Error', err));

// Set up Express application
const app = express();
app.use(express.json());

const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  model: openAiEmbeddingModel,
});

// Function to generate embeddings using OpenAI
async function generateOpenAIEmbedding(text: string): Promise<number[]> {
  return embeddings
    .embedQuery(text)
    .then((embedding) => {
      if (Array.isArray(embedding)) {
        return embedding;
      } else {
        throw new Error('Unexpected embedding format from OpenAI');
      }
    })
    .catch((error) => {
      console.error('Error generating OpenAI embedding:', error);
      throw error;
    });
}

// Function to generate embeddings using Hugging Face
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const embedding = await hf.featureExtraction({
      model: freeEmbeddingModel,
      inputs: text,
    });

    // Handle different return formats from Hugging Face
    let embeddingArray: number[];

    if (Array.isArray(embedding)) {
      if (Array.isArray(embedding[0])) {
        embeddingArray = embedding[0] as number[]; // Take the first embedding if it's a batch
      } else {
        embeddingArray = embedding as number[]; // Single embedding
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

// Function to find similar movies using KNN search
async function findSimilarMovies(query: string) {
  try {
    const embedding = await generateOpenAIEmbedding(query);
    const queryBuffer = Buffer.from(new Float32Array(embedding).buffer);

    const results = await client.ft.search(
      'idx:movies_json',
      '*=>[KNN 10 @embedding $query_vec AS score]',
      {
        PARAMS: {
          query_vec: queryBuffer,
        },
        SORTBY: 'score',
        LIMIT: {
          from: 0,
          size: 10,
        },
        RETURN: ['name', 'year', 'text', 'genre', 'actors', 'score'],
        DIALECT: 2,
      },
    );

    return results;
  } catch (error) {
    console.error('Error finding similar movies:', error);
    throw error;
  }
}

// Endpoint to create a Redis index for movie data
app.post('/create-index', async (req: Request, res: Response) => {
  try {
    await client.ft.create(
      'idx:movies_json',
      {
        // Define schema fields with JSONPath
        '$.text': {
          type: SCHEMA_FIELD_TYPE.TEXT,
          AS: 'text', // Alias for querying
        },
        '$.metadata.name': {
          type: SCHEMA_FIELD_TYPE.TEXT,
          AS: 'name',
          SORTABLE: true,
        },
        '$.metadata.year': {
          type: SCHEMA_FIELD_TYPE.NUMERIC,
          AS: 'year',
          SORTABLE: true,
        },
        '$.genre': {
          type: SCHEMA_FIELD_TYPE.TAG,
          AS: 'genre',
        },
        '$.actors': {
          type: SCHEMA_FIELD_TYPE.TEXT,
          AS: 'actors',
        },
        '$.embedding': {
          type: SCHEMA_FIELD_TYPE.VECTOR,
          TYPE: 'FLOAT32',
          ALGORITHM: 'HNSW',
          DISTANCE_METRIC: 'COSINE',
          DIM: 1536, // Embedding dimensions
          AS: 'embedding',
        },
      },
      {
        ON: 'JSON',
        PREFIX: 'movie:',
      },
    );
    res.status(201).json('JSON movie index created successfully');
  } catch (error) {
    console.log('Error', error);
    res.status(400).json({ error });
  }
});

// Endpoint to store movie embeddings in Redis
app.post('/store-embeddings', async (req: Request, res: Response) => {
  const { text, metadata } = req.body;

  try {
    const embeddingArray = await generateOpenAIEmbedding(text);

    const movieId = `${metadata.name.toLowerCase().replace(/\s+/g, '_')}_${metadata.year}`;
    const key = `movie:${movieId}`;

    const document = {
      metadata,
      genre: metadata.genre || 'Unknown',
      actors: metadata.actors || 'Unknown',
      embedding: embeddingArray, // Store as array in JSON
    };

    // Store as JSON document
    await client.json.set(key, '$', document);

    res.status(201).json({ message: `Record created` });
  } catch (error) {
    console.log('Error', error);
    res.status(400).json({ error });
  }
});

// Endpoint to query movie embeddings using KNN
app.post('/query', async (req: Request, res: Response) => {
  const { query } = req.body;

  try {
    const results = await findSimilarMovies(query);

    res.status(200).json({ results });
  } catch (error) {
    console.log('Error', error);
    res.status(400).json({ error });
  }
});

// Endpoint to flush the Redis database
app.post('/flush-db', async (req: Request, res: Response) => {
  try {
    await client.flushAll();
    console.log('All data removed from current Redis database');
    res.status(200).json({ message: 'Current database flushed successfully' });
  } catch (error) {
    console.error('Error flushing current database:', error);
  }
});

// Endpoint to list all Redis indexes
app.get('/index', async (req: Request, res: Response) => {
  try {
    const indexes = await client.ft._list();

    res.status(200).json({ indexes });
  } catch (error) {
    console.log('No search indexes found or RediSearch not available');
  }
});

// Endpoint to get information about a specific Redis index
app.get('/index/:name', async (req: Request, res: Response) => {
  const index = req.params.name;

  try {
    const indexInfo = await client.ft.info(index);
    res.status(200).json({ indexInfo });
  } catch (error) {
    console.log(`Could not get info for index ${index}`);
  }
});

// Endpoint to fetch records from a Redis index
app.post('/records', async (req: Request, res: Response) => {
  const { index } = req.body;

  try {
    const records = await client.ft.search(index, '*', {
      LIMIT: {
        from: 0,
        size: 10,
      },
      RETURN: ['name', 'year', 'text', 'genre', 'actors'],
    });

    res.status(200).json({ records });
  } catch (error) {
    console.log('Error fetching records:', error);
    res.status(400).json({ error });
  }
});

// Endpoint to handle chat queries
app.post('/chat', async (req: Request, res: Response) => {
  const { query } = req.body;

  try {
    const redisResponse = await findSimilarMovies(query);

    const context =
      (redisResponse as RedisResponse)?.documents
        ?.map((doc) => JSON.stringify(doc.value, null, 2))
        .join('\n') || '';

    // Create a prompt template for the chat model
    const prompt = PromptTemplate.fromTemplate(`
      You are a movie expert. Answer the user's questions based only on the following context.
      If the answer is not in the context, reply politely that you do not have that information.
      Do not mention that you retrieved data from context.
      ===================
      Context: {context}
      ===================
      
      user: {question}
      
      assistant:
    `);

    // Create a runnable sequence with the prompt and chat model
    const chain = RunnableSequence.from([
      {
        question: () => query,
        context: () => context,
      },
      prompt,
      chtModel, // LLM instance
      new StringOutputParser(),
    ]);

    // Generate response
    const output = await chain.invoke({});

    res.status(200).json({ output });
  } catch (error) {
    console.log('Error in chat endpoint:', error);
    res.status(400).json({ error });
  }
});

// Start the Express server
const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  await client.connect();
  console.log(`Express server listening on port ${PORT}`);
});
