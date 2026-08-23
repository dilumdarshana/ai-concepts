# langgraph

Express + LangGraph concept demos — one route per concept (see `CONCEPTS.md` for the deep explanations).

- `pnpm dev:langgraph` from workspace root
- Express on port 3000 — `GET /` lists every concept route
- Routes (each demonstrates one concept):
  - Graph mechanics (no API keys needed): `/graph`, `/reducers`, `/conditional`, `/parallel`, `/subgraph`, `/supervisor`, `/interrupt`, `/time-travel`
  - Model-backed (needs `OPENAI_API_KEY`): `/memory`, `/agent`, `/stream`, `/structured`
- `/agent` uses LangGraph `createAgent` (from the `langchain` package) with tools: `convertCurrency` (FreeCurrency API), `getDatabaseSchema` + `queryDatabase` (Prisma/PostgreSQL), and GitHub MCP tools
- `/memory` uses `MessagesAnnotation` + `MemorySaver` (keyed by `thread_id`)
- `/interrupt` uses `interrupt()` + `Command({ resume })` (suspends, then resumes)
- Prisma schema (`prisma/schema.prisma`) has `Task` and `User` models
- `postinstall` runs `prisma generate` automatically — run it again after schema changes
- `test.rest` for manual API testing
- `.env` needs `OPENAI_API_KEY`, `DATABASE_URL`, `FREE_CURRENCY_KEY`, and optionally `GITHUB_AUTH_TOKEN`
