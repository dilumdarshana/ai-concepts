# rag-redis

Express + Redis/RediSearch vector DB.

- `pnpm dev:rag-redis` from workspace root
- Express on port **4000** (not 3000 like most projects) — endpoints: POST /create-index, /store-embeddings, /query, /chat, /flush-db, GET /index, GET /index/:name, POST /records
- Requires Redis with RediSearch module
- OpenAI embedding model: `text-embedding-3-small` (1536 dimensions)
- Movie data from `data/movies.json`, stored as Redis JSON
- KNN search on `idx:movies_json` index via `@redis/search`
- `test.rest` for manual API testing
- `.env` needs `OPENAI_API_KEY`, `REDIS_URL`
