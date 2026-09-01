import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { chunkAll, loadDocuments } from './chunk.js';
import { embedQuery, embedTexts, makeEmbeddings } from './embed.js';
import { buildBm25, type Bm25Index } from './sparse.js';
import {
  collectionInfo,
  collectionName,
  dropCollection,
  makeClient,
  qdrantUrl,
  queryCollection,
  upsertChunks,
  ensureCollection,
} from './store.js';
import type { RetrievalMode, RetrievedChunk } from './types.js';

dotenv.config({ quiet: true });

const app = express();
app.use(express.json());

const DOCS_DIR = fileURLToPath(new URL('../data/documents', import.meta.url));
const MODES: RetrievalMode[] = ['dense', 'sparse', 'hybrid'];

const client = makeClient();
const embeddings = makeEmbeddings();

// The BM25 index is corpus-aware (IDF, average length), so it must be built
// from every chunk at ingest and reused for queries. Cached here in memory
// and rebuilt from data/documents/ on demand so a server restart doesn't lose
// the sparse vocabulary (dense vectors + Qdrant points persist).
let sparseIndex: Bm25Index | null = null;

/** Rebuilds the BM25 index from the local docs if it isn't cached yet. */
function ensureSparseIndex(): void {
  if (sparseIndex) return;
  const chunks = chunkAll(loadDocuments(DOCS_DIR));
  sparseIndex = buildBm25(chunks.map((c) => c.text));
}

app.get('/health', async (_req: Request, res: Response) => {
  try {
    const info = await collectionInfo(client);
    res.json({
      status: 'healthy',
      provider: 'qdrant',
      qdrant: qdrantUrl(),
      collection: info.name,
      documents: info.points,
      denseModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      denseVectorSize: info.denseVectorSize,
      sparseConfigured: info.sparseConfigured,
      localDocs: loadDocuments(DOCS_DIR).length,
    });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: String(error) });
  }
});

/**
 * POST /ingest — content-aware chunk + embed + index every doc in data/documents/.
 *
 * Recreates the collection each run (delete + create) so re-ingesting is
 * idempotent. Dense vectors come from OpenAI; sparse BM25 weights are
 * computed in-process over the same chunks and stored under the `sparse`
 * named vector. Qdrant fuses the two at query time.
 */
app.post('/ingest', async (_req: Request, res: Response) => {
  try {
    const docs = loadDocuments(DOCS_DIR);
    const chunks = chunkAll(docs);

    const dense = await embedTexts(
      embeddings,
      chunks.map((c) => c.text),
    );
    sparseIndex = buildBm25(chunks.map((c) => c.text));
    const { vectors: sparse } = sparseIndex;

    await ensureCollection(client, true);
    await upsertChunks(
      client,
      chunks.map((chunk, i) => ({ chunk, dense: dense[i], sparse: sparse[i] })),
    );

    const perSource = new Map<string, number>();
    for (const chunk of chunks) {
      const source = String(chunk.metadata.source ?? '');
      perSource.set(source, (perSource.get(source) ?? 0) + 1);
    }

    res.status(201).json({
      ingested: chunks.length,
      collections: collectionName(),
      sources: docs.map((d) => ({
        name: d.name,
        chunks: perSource.get(d.name) ?? 0,
      })),
    });
  } catch (error) {
    console.error('Error on ingest', error);
    res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /query — run retrieval through any single stage.
 * Body: { query, mode?: "dense"|"sparse"|"hybrid", k? }
 * hybrid returns `channels` (per-channel top-k before RRF) for observability.
 */
app.post('/query', async (req: Request, res: Response) => {
  try {
    const {
      query,
      mode = 'hybrid',
      k = 5,
    } = req.body as {
      query: string;
      mode?: RetrievalMode;
      k?: number;
    };
    if (!query || !MODES.includes(mode)) {
      res
        .status(400)
        .json({ error: `body requires query and mode in ${MODES.join('|')}` });
      return;
    }

    const start = Date.now();
    ensureSparseIndex();
    const dense = await embedQuery(embeddings, query);
    const sparse = sparseIndex?.query(query) ?? null;

    if (mode === 'sparse' && !sparse) {
      res.json({
        query,
        mode,
        tookMs: Date.now() - start,
        results: [],
        channels: undefined,
      });
      return;
    }

    const { results, channels } = await queryCollection(
      client,
      { dense, sparse, k },
      mode,
    );
    res.json({
      query,
      mode,
      tookMs: Date.now() - start,
      results,
      ...(channels ? { channels } : {}),
    });
  } catch (error) {
    console.error('Error on query', error);
    res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /chat — full RAG pipeline: hybrid retrieve -> fuse -> LLM answer with citations.
 * Context is assembled content-aware: each chunk carries its heading breadcrumb,
 * so the model sees "Vector Databases > Sparse vectors" as retrievable context.
 */
app.post('/chat', async (req: Request, res: Response) => {
  try {
    const { query, k = 4 } = req.body as { query: string; k?: number };
    if (!query) {
      res.status(400).json({ error: 'body requires query' });
      return;
    }
    const start = Date.now();
    ensureSparseIndex();
    if (sparseIndex === null || loadDocuments(DOCS_DIR).length === 0) {
      res.status(400).json({ error: 'no corpus loaded — drop docs in data/documents/ and run POST /ingest' });
      return;
    }
    const dense = await embedQuery(embeddings, query);
    const sparse = sparseIndex.query(query);
    const { results } = await queryCollection(
      client,
      { dense, sparse, k: Math.max(k * 2, 8) },
      'hybrid',
    );
    const contextChunks: RetrievedChunk[] = results.slice(0, k);

    const context =
      contextChunks
        .map((chunk, i) => {
          const loc = chunk.metadata.path
            ? ` [${chunk.metadata.source} :: ${chunk.metadata.path}]`
            : ` [${chunk.metadata.source ?? chunk.id}]`;
          return `Document ${i + 1}${loc}:\n${chunk.text}`;
        })
        .join('\n\n') || '';

    const prompt =
      PromptTemplate.fromTemplate(`Answer the user's question using only the context below.
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
    const chain = RunnableSequence.from([
      prompt,
      model,
      new StringOutputParser(),
    ]);
    const answer = await chain.invoke({ context, question: query });

    res.json({
      answer,
      sources: contextChunks.map((chunk) => ({
        id: chunk.id,
        source: chunk.metadata.source,
        path: chunk.metadata.path ?? null,
        score: chunk.score,
      })),
      tookMs: Date.now() - start,
    });
  } catch (error) {
    console.error('Error on chat', error);
    res.status(500).json({ error: String(error) });
  }
});

/** POST /flush — delete the collection so the next /ingest starts clean. */
app.post('/flush', async (_req: Request, res: Response) => {
  try {
    await dropCollection(client);
    res.json({ flushed: true, collection: collectionName() });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

const PORT = Number(process.env.PORT || 6300);
const server = app.listen(PORT, () => {
  console.log(`rag-hybrid-qdrant listening on http://localhost:${PORT}`);
});
server.on('error', (error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});

// Qdrant is required — fail fast with a clear hint, mirroring other DB projects.
void (async () => {
  try {
    await client.getCollections();
    console.log(
      `Qdrant connected at ${qdrantUrl()} | collection: ${collectionName()}`,
    );
  } catch (error) {
    console.error(
      'Qdrant connection failed — run: docker compose up -d',
      error,
    );
    process.exit(1);
  }
})();
