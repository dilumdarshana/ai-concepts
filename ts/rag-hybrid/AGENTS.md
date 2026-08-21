# rag-hybrid

Express + ChromaDB hybrid retrieval — dense vectors + sparse BM25 + RRF fusion + local cross-encoder reranking.

- `pnpm dev:rag-hybrid` from workspace root (tsx watch, ESM)
- Express on port **6200**; Chroma on **8100** via own docker-compose (`chromadb/chroma:1.5.9`)
- Endpoints: GET /health, POST /ingest, POST /query, POST /chat
- **Dual provider** (auto-detected in `store.ts`): cloud vars set (`CHROMA_API_KEY`/`CHROMA_TENANT`/`CHROMA_DATABASE`) → Chroma Cloud with native sparse index + server-side `Search(Rrf(...))`; otherwise local Docker + app-side BM25/RRF. Same API either way; `/health` reports `provider`
- Dense channel: Chroma HNSW cosine + OpenAI `text-embedding-3-small` (1536 dims)
- Sparse channel: hand-rolled BM25 (`src/bm25.ts`, k1=1.2 b=0.75) over `data/movies.json`; deterministic ids `title-year`
- Fusion: RRF k=60, weights dense 0.7 / sparse 0.3 — app-side (`fusion.ts`) locally, native `Rrf()` on cloud
- Reranking: `Xenova/ms-marco-MiniLM-L-6-v2` cross-encoder via transformers.js v4, q8, sigmoid-normalized scores; lazy-loaded (~90MB download on first use, cached in `.cache/`)
- `/query` modes: `dense | sparse | hybrid`; optional `rerank: true` + `topN`; hybrid returns per-channel breakdown
- Chat = hybrid retrieve → fuse → rerank top-k → ChatOpenAI (`gpt-4o-mini`, temp 0) with cited sources
- `test.rest` for manual API testing
- `.env`: needs `OPENAI_API_KEY`; cloud vars optional (see `.env_example`)

## Critical gotchas

- transformers.js v4 tokenizer pairs go in call options: `tok(queries, { text_pair: docs })` — NOT as 3rd positional arg
- ms-marco MiniLM raw logits span roughly −11…+10; sigmoid-normalize before exposing as scores
- `Xenova/ms-marco-MiniLM-L-6-v2` judges by *lexical overlap too* — paraphrased queries without shared tokens score low even when semantically related
- ChromaClient v3.5: `path` option deprecated — pass `host`/`port`/`ssl`
- **Cloud schema rules**: collection config + schema are mutually exclusive (EF goes inside `VectorIndexConfig`); sparse vector indices must be sorted ascending; Search API scores are distance-like (negate them); re-fetch the collection after create (`createCollection()` instances return rows without documents)
- **Detailed educational comments are intentional here** (user request) — keep them when editing; explain the concepts, not just the syntax
