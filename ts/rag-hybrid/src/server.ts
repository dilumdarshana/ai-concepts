import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { ChatOpenAI } from '@langchain/openai';
import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { COLLECTION_NAME, getChromaClient, getCollection, loadMovies, movieId, recreateCollection } from './store.js';
import { retrieve, type RetrievalMode } from './retrieval.js';
import { isRerankerReady, preloadReranker, rerank, rerankerModel } from './rerank.js';

dotenv.config({ quiet: true });

const app = express();
app.use(express.json());

const MODES: RetrievalMode[] = ['dense', 'sparse', 'hybrid'];

/**
 * GET /health — liveness + component status.
 * Reports all three pipeline components independently: Chroma (dense store),
 * the BM25 index size (sparse channel), and whether the cross-encoder has
 * finished loading (it loads in the background at startup).
 */
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const heartbeat = await getChromaClient().heartbeat();
    const collection = await getCollection();
    res.json({
      status: 'healthy',
      chroma: heartbeat > 0 ? 'connected' : 'not connected',
      collection: COLLECTION_NAME,
      documents: await collection.count(),
      sparseIndex: { type: 'bm25', documents: loadMovies().length },
      reranker: { model: rerankerModel(), loaded: isRerankerReady() },
    });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: String(error) });
  }
});

/**
 * POST /ingest — (re)load data/movies.json into both channels.
 *
 * Dense: recreates the Chroma collection and upserts every movie with a
 *        deterministic id ("title-year"), so re-running never duplicates.
 * Sparse: nothing to do here — the BM25 index is rebuilt automatically on
 *         server start from the same file.
 */
app.post('/ingest', async (_req: Request, res: Response) => {
  try {
    const movies = loadMovies();
    const collection = await recreateCollection();
    await collection.upsert({
      ids: movies.map((movie) => movieId(movie)),
      documents: movies.map((movie) => movie.text),
      metadatas: movies.map((movie) => movie.metadata),
    });
    res.status(201).json({ ingested: movies.length, collection: COLLECTION_NAME });
  } catch (error) {
    console.error('Error on ingest', error);
    res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /query — run retrieval through any single stage of the pipeline.
 *
 * Body: { query, mode?: "dense"|"sparse"|"hybrid", k?, rerank?, topN? }
 *
 * With rerank=false this is a pure retriever comparison tool. With
 * rerank=true the fused results are re-scored by the local cross-encoder and
 * the response gains `rerank.orderBefore` / `orderAfter` id lists so you can
 * see exactly how the second stage reshuffled the ranking.
 */
app.post('/query', async (req: Request, res: Response) => {
  try {
    const {
      query,
      mode = 'hybrid',
      k = 5,
      rerank: shouldRerank = false,
      topN,
    } = req.body as {
      query: string;
      mode?: RetrievalMode;
      k?: number;
      rerank?: boolean;
      topN?: number;
    };

    if (!query || !MODES.includes(mode)) {
      res.status(400).json({ error: `body requires query and mode in ${MODES.join('|')}` });
      return;
    }

    const started = Date.now();
    const retrieved = await retrieve(query, mode, k);
    let results = retrieved.results;

    const response: Record<string, unknown> = {
      query,
      mode,
      tookMs: Date.now() - started,
      results,
    };
    // Hybrid only: per-channel top-k BEFORE fusion, for observability.
    if (retrieved.channels) response.channels = retrieved.channels;

    if (shouldRerank && results.length > 0) {
      const reranked = await rerank(query, results, topN);
      response.rerank = {
        model: rerankerModel(),
        applied: true,
        orderBefore: results.map((chunk) => chunk.id),
        orderAfter: reranked.map((chunk) => chunk.id),
      };
      response.results = reranked;
    }

    res.json(response);
  } catch (error) {
    console.error('Error on query', error);
    res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /chat — full RAG pipeline: hybrid retrieve -> fuse -> cross-encoder
 * rerank -> LLM answer with citations.
 *
 * Stage details:
 *   1. Retrieve an oversized candidate pool (max(2k, 8)) — reranking is
 *      precise enough to shrink it back down to k safely.
 *   2. Cross-encoder scores every candidate jointly with the query; only the
 *      top k survive into the prompt. This is where filler that fusion let
 *      through gets filtered out (rerankScore ~0).
 *   3. Numbered context blocks let the model cite [1], [2]...; sources in the
 *      response carry each cited doc's rerankScore.
 */
app.post('/chat', async (req: Request, res: Response) => {
  try {
    const { query, k = 4 } = req.body as { query: string; k?: number };
    if (!query) {
      res.status(400).json({ error: 'body requires query' });
      return;
    }

    const started = Date.now();
    const { results: candidates } = await retrieve(query, 'hybrid', Math.max(k * 2, 8));
    const contextChunks = await rerank(query, candidates, k);

    const context =
      contextChunks
        .map(
          (chunk, i) =>
            `Document ${i + 1} [${String(chunk.metadata?.name ?? chunk.id)} (${String(chunk.metadata?.year ?? '')})]:\n${chunk.text}`,
        )
        .join('\n\n') || '';

    const prompt = PromptTemplate.fromTemplate(`Answer the user's question using only the context below.
If the answer is not in the context, say you don't have that information.
Cite document numbers like [1] when relevant.

Context:
{context}

Question: {question}`);

    const model = new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
      temperature: 0,
    });

    const chain = RunnableSequence.from([prompt, model, new StringOutputParser()]);
    const answer = await chain.invoke({ context, question: query });

    res.json({
      answer,
      sources: contextChunks.map((chunk) => ({
        id: chunk.id,
        name: chunk.metadata?.name,
        year: chunk.metadata?.year,
        rerankScore: chunk.rerankScore,
      })),
      tookMs: Date.now() - started,
    });
  } catch (error) {
    console.error('Error on chat', error);
    res.status(500).json({ error: String(error) });
  }
});

const PORT = Number(process.env.PORT || 6200);
const server = app.listen(PORT, () => {
  console.log(`rag-hybrid listening on http://localhost:${PORT}`);
});

// Without this handler an EADDRINUSE would crash tsx watch mid-reload with a
// confusing stack; here it fails fast with one clear line instead.
server.on('error', (error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});

// Startup sequence: Chroma is REQUIRED (exit if unreachable), the reranker is
// OPTIONAL-but-warmed (loads in background so first request isn't slow).
void (async () => {
  try {
    await getChromaClient().heartbeat();
    console.log(`ChromaDB connected at ${process.env.CHROMA_URL || 'http://localhost:8100'}`);
  } catch (error) {
    console.error('ChromaDB connection failed — run: docker compose up -d', error);
    process.exit(1);
  }
  void preloadReranker().then(() =>
    console.log(`Reranker ready: ${rerankerModel()}`),
  );
})();
