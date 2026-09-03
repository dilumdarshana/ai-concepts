# langchain

Express server demonstrating major LangChain concepts, one route per concept.

- `pnpm dev:langchain` from workspace root (runs `server.ts`)
- Express on port 3000 — `GET /` lists concept routes
- Concept routes: `/messages`, `/prompt`, `/chat-prompt`, `/structured`, `/chain`, `/lc`, `/stream`, `/tools`, `/memory`, `/trim`
- Uses LangGraph `StateGraph` + `MemorySaver` for persistent memory (keyed by `thread_id`)
- `test.rest` for manual API testing of every route
- `.env` needs `OPENAI_API_KEY`; `.env` may also set `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASE_URL` (optional — see `langfuse.ts`)
- Observability: Langfuse via `@langfuse/langchain` `CallbackHandler` + `@langfuse/otel` `LangfuseSpanProcessor` (see `langfuse.ts`); tracing is off when keys are unset
- Depends on `@langchain/langgraph` (declared in package.json — do not rely on workspace hoisting)
