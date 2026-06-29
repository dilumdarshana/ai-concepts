import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';
import { InferenceClient } from '@huggingface/inference';
import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOpenAI } from '@langchain/openai';

dotenv.config();

// Pinecone vector store client — stores and searches embedding vectors
const pcClient = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY || '',
});

// HuggingFace Inference API client — generates embeddings (free tier)
const hf = new InferenceClient(process.env.HUGGINGFACE_TOKEN || '');

const app = express();
app.use(express.json());

// Free sentence-transformer model: 384-dimensional embeddings
const embeddingModel = 'sentence-transformers/all-MiniLM-L12-v2';
const pineConeIndex = 'my-index';

// POST /create-index — create a serverless Pinecone index
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

// POST /embeddings — generate embedding and upsert into Pinecone
app.post('/embeddings', async (req: Request, res: Response) => {
  try {
    const { text, metadata } = req.body;

    const embedding = await hf.featureExtraction({
      model: embeddingModel,
      inputs: text,
    });

    // HuggingFace returns either number[] or number[][] — normalize to flat array
    let embeddingArray;
    if (Array.isArray(embedding)) {
      if (typeof embedding[0] === 'number') {
        embeddingArray = embedding;
      } else if (Array.isArray(embedding[0])) {
        embeddingArray = embedding[0];
      }
    }

    if (!embeddingArray || !Array.isArray(embeddingArray)) {
      res.status(400).json({ error: 'Invalid embedding output' });
    }

    const index = pcClient.index<{ genre: string }>({ name: 'my-index' });

    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    await index.upsert({
      records: [
        {
          id: uniqueId,
          values: embeddingArray as number[],
          metadata,
        },
      ],
    });
    res.status(201).json({ message: `Record created`, embedding });
  } catch (error) {
    console.log('Error', error);
    res.status(400).json({ error });
  }
});

// Extract a 4-digit year from query text (used for metadata filtering)
function extractYear(text: string): number | undefined {
  const match = text.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

// POST /query — nearest-neighbor search with optional year filter
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

    const index = pcClient.index<{ genre: string }>({ name: 'my-index' });

    // Auto-filter by year when the query mentions one (e.g. "movies from 2010")
    const year = extractYear(query);
    const result = await index.query({
      topK: 5,
      vector: embeddingArray as number[],
      includeMetadata: true,
      filter: year ? { year: { $eq: year } } : undefined,
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error });
  }
});

// POST /chat — RAG pipeline: retrieve context → LLM answer
app.post('/chat', async (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    // Step 1: embed the user question
    const embeddingResult = await hf.featureExtraction({
      model: embeddingModel,
      inputs: query,
    });

    const embeddingArray = Array.isArray(embeddingResult[0])
      ? embeddingResult[0]
      : embeddingResult;

    // Step 2: retrieve relevant documents from Pinecone
    const index = pcClient.index<{ genre: string }>({ name: pineConeIndex });
    const year = extractYear(query);
    const results = await index.query({
      vector: embeddingArray as number[],
      topK: 3,
      includeMetadata: true,
      includeValues: true,
      filter: year ? { year: { $eq: year } } : undefined,
    });

    // Step 3: build context string from retrieved metadata
    const context =
      results.matches?.map((m) => JSON.stringify(m.metadata)).join('\n') || '';

    // Step 4: create prompt with context injected
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

    // OpenAI GPT-4o for the final answer generation
    const model = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o',
      temperature: 0.7,
    });

    // Step 5: run the LangChain sequence (context → prompt → LLM → string)
    const chain = RunnableSequence.from([
      {
        question: () => query,
        context: () => context,
      },
      prompt,
      model,
      new StringOutputParser(),
    ]);

    const output = await chain.invoke({});

    res.json({ answer: output });
  } catch (error) {
    console.log('Error', error);
    res.status(400).json({ error });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`);
});
