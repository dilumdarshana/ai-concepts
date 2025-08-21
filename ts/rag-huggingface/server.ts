import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';
import { InferenceClient } from '@huggingface/inference'; // Call APIs
import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOpenAI } from '@langchain/openai';

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

// Free embedding model
const embeddingModel = 'sentence-transformers/all-MiniLM-L12-v2'; // all-MiniLM-L6-v2
const pineConeIndex = 'my-index';

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
      dimension: 384, // why this hard coded
    });
    res.status(201).json({ message: `Pinecone index ${name} created` });
  } catch (error) {
    res.status(400).json({ error });
  }
});

// Create a record in Pinecone
app.post('/embeddings', async (req: Request, res: Response) => {
  try {
    // const { text = 'Sample input' } = req.body;
    const { text, metadata } = req.body;

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

    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    await index.upsert([{
      id: uniqueId,
      values: embeddingArray as number[],
      metadata,
    }]);
    res.status(201).json({ message: `Record created`, embedding });
  } catch (error) {
    console.log('Error', error);
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

    const index = pcClient.index<{ genre: string }>('my-index');

    const result = await index.query({
      topK: 1,
      vector: embeddingArray as number[],
      includeMetadata: true,
      // includeValues: true,
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error });
  }
});

// Chat with agent
app.post('/chat', async (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    // Step 1: Embed the question
    const embeddingResult = await hf.featureExtraction({
      model: embeddingModel,
      inputs: query,
    });

    const embeddingArray = Array.isArray(embeddingResult[0])
      ? embeddingResult[0]
      : embeddingResult;

    // Step 2: Search Pinecone for relevant documents
    const index = pcClient.index<{ genre: string }>(pineConeIndex);
    const results = await index.query({
      vector: embeddingArray as number[],
      topK: 3,
      includeMetadata: true,
      includeValues: true,
    });

    // Only metadata can be get from Pinecode as readable inject to LLM
    const context = results.matches?.map(m => JSON.stringify(m.metadata)).join('\n') || '';

    // Step 3: Create prompt
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

    // Free models did not work well. Uisng Open AI model
    const model = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o',
      temperature: 0.7,
    });

    // Step 4: Generate response
    const chain = RunnableSequence.from([
      {
        question: () => query,
        context: () => context,
      },
      prompt,
      model, // LLM instance
      new StringOutputParser(),
    ]);

    // Step 5: Execute the chain
    const output = await chain.invoke({});

    res.json({ answer: output });
  } catch (error) {
    console.log('Error', error);
    res.status(400).json({ error });
  }
});

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Express server listening on port ${PORT}`);
});
