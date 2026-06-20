# langgraph

Express + LangGraph agent + Prisma/PostgreSQL.

- `pnpm dev:langgraph` from workspace root
- Express on port 3000 — POST /agent
- Uses LangGraph `createReactAgent` with 3 tools: `convertCurrency` (FreeCurrency API), `getUserByName`, `getAllUsers` (Prisma/PostgreSQL)
- Prisma schema (`prisma/schema.prisma`) has `Task` and `User` models
- `postinstall` runs `prisma generate` automatically — run it again after schema changes
- `test.rest` for manual API testing
- `.env` needs `OPENAI_API_KEY`, `DATABASE_URL`, `FREECURRENCY_API_KEY`
