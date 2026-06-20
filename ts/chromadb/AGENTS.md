# chromadb

Express + ChromaDB vector store.

- `pnpm dev:chromadb` from workspace root
- Requires Docker: `docker compose up -d` (runs `chromadb/chroma:latest` on port 8000)
- Express on port 3000 — endpoints: GET /health, POST /collections, POST /collections/:name/add, POST /collections/:name/query
- Uses OpenAI embeddings via `@chroma-core/openai`
- `test.rest` for manual API testing
- `.env` needs `OPENAI_API_KEY`
