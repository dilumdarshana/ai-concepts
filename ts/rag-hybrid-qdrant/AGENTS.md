# rag-hybrid-qdrant

Express + Qdrant hybrid retrieval — content-aware chunking, dense vectors + sparse BM25 + native RRF fusion.

- `pnpm dev:rag-hybrid-qdrant` from workspace root (tsx watch, ESM)
- Express on port **6300**; Qdrant on **6333** via own docker-compose (`qdrant/qdrant:v1.19.0`), persistent volume in `qdrant-data/`
- **Qdrant Web UI** at <http://localhost:6333/dashboard> — browse collections, points, and payloads
- Endpoints: GET /health, POST /ingest, POST /query, POST /chat, POST /flush
- **Content-aware chunking** (`src/chunk.ts`): markdown splits on the heading tree and prefixes each chunk with its breadcrumb (`Vector Databases > Sparse vectors > BM25`); JSON becomes one chunk per row; long sections are split with an overlap
- **Hybrid retrieval is native to Qdrant**: dense (`text-embedding-3-small`, 1536 dims) + sparse (in-process BM25) prefetches fused by Qdrant's `Rrf` in the Universal Query API — no hand-rolled fusion code like `rag-hybrid`
- Sparse channel: BM25 (k1=1.2, b=0.75) computed at ingest over every chunk, stored under Qdrant's `sparse` named vector with `modifier: 'none'` (weights already include IDF)
- `/query` modes: `dense | sparse | hybrid`; hybrid returns per-channel top-k for observability
- `/chat` = hybrid retrieve → fuse → LLM (`gpt-4o-mini`, temp 0) with cited sources; sources carry heading `path`
- Data lives in `data/documents/` (.md, .json, .txt); drop docs there and re-`/ingest`
- `test.rest` for manual API testing
- `.env` needs `OPENAI_API_KEY` (+ optional `QDRANT_URL`, `PORT`, `COLLECTION_NAME`)

## Critical gotchas

- **Qdrant point ids must be an unsigned integer or a UUID** — not arbitrary strings. The store uses sequential integer ids and keeps the readable `chunkId` in the payload (`store.ts`)
- `client.collectionExists()` returns `{ exists: boolean }` (not a boolean) in recent clients — `store.ts` unwraps `.exists`
- Client and server Qdrant versions should match (or be within one minor). Both are pinned to **1.19.x** here (`@qdrant/js-client-rest` + `qdrant/qdrant:v1.19.0`) to avoid the compatibility warning
- `modifier: 'none'` on the sparse vector is deliberate — the BM25 weights already include IDF; `'idf'` would double-count it
- Qdrant `query()` with `prefetch` + a top-level `rrf` fusion must keep `limit` of each prefetch >= final `limit` (handled by `limit = k * 4` in `queryCollection`)
- Server fails fast on startup if Qdrant is unreachable — run `docker compose up -d` first
