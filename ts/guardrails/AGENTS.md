# guardrails

Express server demonstrating LLM guardrails — one route per concept (see `CONCEPTS.md` for the deep explanations).

- `pnpm dev:guardrails` from workspace root (runs `server.ts`)
- Express on port 3000 — `GET /` lists every concept route
- Routes (each demonstrates one guardrail concept):
  - Input guardrails (block or sanitize before the model): `/input/topic`, `/input/injection`, `/input/sanitize`
  - Output guardrails (validate after the model): `/output/schema`, `/output/quality`, `/output/hallucination`
  - Full pipeline: `/chat` (input guards → model → output guards)
- Two mechanisms: deterministic checks (allowlist/regex — free, instant) and LLM-as-judge (a second model call scores the answer)
- Blocking guards throw `GuardrailError` → HTTP `400` with `{ blocked, guardrail, reason }`
- `test.rest` for manual API testing
- `.env` needs `OPENAI_API_KEY`; `.env` may also set `LLM_MODEL` (generator, default `gpt-4o`), `JUDGE_MODEL` (LLM-as-judge, defaults to `LLM_MODEL`), and `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASE_URL` (optional — see `langfuse.ts`)
- Observability: Langfuse via `@langfuse/langchain` `CallbackHandler` + `@langfuse/otel` `LangfuseSpanProcessor` (see `langfuse.ts`); tracing is off when keys are unset
- Depends on `@langchain/core` and `@langchain/openai` (declared in package.json — do not rely on workspace hoisting)