# rag-json

Next.js 15 RAG app with JSON data source.

- `pnpm dev:rag` from workspace root (uses Turbopack)
- `pnpm lint` — runs `next lint` (no standalone ESLint config)
- 4 chat API routes under `app/api/` with increasing complexity: basic → LangChain → personalized → RAG with JSONLoader
- Data source: `data/movie.json`
- Copy `.env.local_example` → `.env.local` for config
- Tailwind CSS v4 with PostCSS
