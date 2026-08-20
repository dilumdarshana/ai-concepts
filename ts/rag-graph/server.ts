import dotenv from 'dotenv';

// Load env vars BEFORE local imports so the Neo4j driver gets credentials.
dotenv.config();

import express, { Request, Response } from 'express';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import {
  createVectorIndex,
  clearGraph,
  getGraphStats,
  getDriver,
} from './graph';
import { ingestDocument } from './ingest';
import { hybridRetrieve, RetrievedChunk } from './retrieval';

const app = express();
app.use(express.json());

const model = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0.3,
});

// Ingest a single document into the knowledge graph.
app.post('/ingest', async (req: Request, res: Response) => {
  const { text, source } = req.body;

  if (!text) {
    res.status(400).json({ error: 'text is required' });
    return;
  }

  try {
    const stats = await ingestDocument(text, source || 'unknown');
    res.status(201).json({ message: 'Document ingested', ...stats });
  } catch (error) {
    console.error('Error ingesting document:', error);
    res.status(500).json({ error: 'Failed to ingest document' });
  }
});

// Ingest the bundled sample dataset (data/sample.json).
app.post('/ingest-sample', async (_req: Request, res: Response) => {
  try {
    const raw = await readFile(
      resolve(__dirname, 'data', 'sample.json'),
      'utf-8',
    );
    const documents = JSON.parse(raw) as { source: string; text: string }[];

    let totalChunks = 0;
    let totalEntities = 0;
    let totalRelationships = 0;

    for (const doc of documents) {
      const stats = await ingestDocument(doc.text, doc.source);
      totalChunks += stats.chunks;
      totalEntities += stats.entities;
      totalRelationships += stats.relationships;
    }

    res.status(201).json({
      message: 'Sample dataset ingested',
      documents: documents.length,
      chunks: totalChunks,
      entities: totalEntities,
      relationships: totalRelationships,
    });
  } catch (error) {
    console.error('Error ingesting sample dataset:', error);
    res.status(500).json({ error: 'Failed to ingest sample dataset' });
  }
});

// Hybrid retrieval only — returns the context chunks (vector + graph).
app.post('/query', async (req: Request, res: Response) => {
  const { query } = req.body;

  if (!query) {
    res.status(400).json({ error: 'query is required' });
    return;
  }

  try {
    const chunks = await hybridRetrieve(query);
    res.status(200).json({ chunks });
  } catch (error) {
    console.error('Error in query endpoint:', error);
    res.status(500).json({ error: 'Failed to retrieve context' });
  }
});

// Full GraphRAG chat — hybrid retrieval + LLM answer.
app.post('/chat', async (req: Request, res: Response) => {
  const { query } = req.body;

  if (!query) {
    res.status(400).json({ error: 'query is required' });
    return;
  }

  try {
    const chunks = await hybridRetrieve(query);

    const context = chunks
      .map((c: RetrievedChunk) => `[${c.source} via ${c.via}] ${c.text}`)
      .join('\n\n');

    const prompt = PromptTemplate.fromTemplate(`
      You are an assistant answering questions about a knowledge graph.
      Answer the user's question based only on the context below.
      If the answer is not in the context, reply that you do not have that information.
      Do not mention that you retrieved data from context.
      ===================
      Context: {context}
      ===================

      user: {question}

      assistant:
    `);

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
    res.status(200).json({ output, chunks });
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ error: 'Failed to generate answer' });
  }
});

// Graph stats for debugging.
app.get('/graph', async (_req: Request, res: Response) => {
  try {
    const stats = await getGraphStats();
    res.status(200).json({ stats });
  } catch (error) {
    console.error('Error fetching graph stats:', error);
    res.status(500).json({ error: 'Failed to fetch graph stats' });
  }
});

// Wipe all graph data.
app.post('/clear', async (_req: Request, res: Response) => {
  try {
    await clearGraph();
    res.status(200).json({ message: 'Graph cleared' });
  } catch (error) {
    console.error('Error clearing graph:', error);
    res.status(500).json({ error: 'Failed to clear graph' });
  }
});

// Health check — verifies Neo4j connectivity.
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const session = getDriver().session();
    await session.run('RETURN 1');
    await session.close();
    res.status(200).json({ status: 'ok', neo4j: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'error', neo4j: 'unreachable' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  try {
    await createVectorIndex();
    console.log(`Express server listening on port ${PORT} (Neo4j connected)`);
  } catch (error) {
    console.error('Could not create vector index — is Neo4j running?', error);
  }
});
