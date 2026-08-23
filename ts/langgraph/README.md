# LangGraph

An Express server that doubles as a **working knowledge base for LangGraph** — one route per concept, so each idea can be opened, exercised, and copied. The deep explanations live in [`CONCEPTS.md`](CONCEPTS.md); the theory behind it lives in [`docs/langchain-vs-langgraph.md`](../../docs/langchain-vs-langgraph.md) and [`docs/ai-agents.md`](../../docs/ai-agents.md).

Two categories of routes:

- **Graph mechanics** — no API keys, pure TypeScript. They show how the graph runtime behaves: state, reducers, routing, parallelism, composition, and persistence.
- **Model-backed** — need `OPENAI_API_KEY`. They show LangGraph talking to an LLM: memory, the prebuilt agent, streaming, and structured output.

## Quick start

```bash
cp .env_example .env   # fill in your keys
pnpm dev:langgraph     # from workspace root
```

Server starts on **port 3000**. `GET /` lists every route.

## Routes

| Route                    | Concept                                                          | Needs API key? |
| ------------------------ | ---------------------------------------------------------------- | -------------- |
| `GET /`                  | index of all routes                                              | no             |
| `POST /graph`            | `StateGraph`: nodes, edges, state, compile, invoke               | no             |
| `POST /reducers`         | state channels: replace vs accumulate (custom reducers)          | no             |
| `POST /conditional`      | conditional edges: the graph decides the next node               | no             |
| `POST /parallel`         | fan-out / fan-in: parallel nodes + reducer join (barrier)        | no             |
| `POST /memory`           | `MessagesAnnotation` + `MemorySaver` + `thread_id`               | yes            |
| `POST /agent`            | `createAgent` (langchain): prebuilt ReAct agent with tools + MCP | yes            |
| `POST /stream`           | streaming: consume tokens as they arrive                         | yes            |
| `POST /interrupt`        | human-in-the-loop: `interrupt()` then resume                     | no             |
| `POST /interrupt/resume` | resumes a suspended `/interrupt` thread                          | no             |
| `POST /subgraph`         | a compiled graph used as a node inside another graph             | no             |
| `POST /supervisor`       | multi-agent: a supervisor routes to sub-agents                   | no             |
| `POST /time-travel`      | replay & fork: `getStateHistory` + `updateState`                 | no             |
| `POST /structured`       | `withStructuredOutput` producing typed state in a node           | yes            |

## Examples

```bash
# Deterministic graph mechanics — instant, no keys:
curl -X POST http://localhost:3000/graph -H 'Content-Type: application/json' -d '{"value":5}'
curl -X POST http://localhost:3000/reducers -H 'Content-Type: application/json' -d '{}'
curl -X POST http://localhost:3000/conditional -H "Content-Type: application/json" -d '{"topic":"The wheel"}'
curl -X POST http://localhost:3000/parallel -H 'Content-Type: application/json' -d '{}'
curl -X POST http://localhost:3000/subgraph -H "Content-Type: application/json" -d '{"value":7}'
curl -X POST http://localhost:3000/supervisor -H "Content-Type: application/json" -d '{"task":"convert 100 USD to EUR"}'
curl -X POST http://localhost:3000/time-travel -H "Content-Type: application/json" -d '{"steps":3,"fork":true}'

# Human-in-the-loop: suspend, then resume:
curl -X POST http://localhost:3000/interrupt -H "Content-Type: application/json" -d '{"request":"Refund $50"}'
curl -X POST http://localhost:3000/interrupt/resume -H "Content-Type: application/json" -d '{"thread_id":"<from interrupt>","approve":true}'

# Model-backed (needs OPENAI_API_KEY):
curl -X POST http://localhost:3000/memory -H 'Content-Type: application/json' -d '{"message":"My name is Dilum","thread_id":"a"}'
curl -X POST http://localhost:3000/memory -H 'Content-Type: application/json' -d '{"message":"What is my name?","thread_id":"a"}'
curl -X POST http://localhost:3000/structured -H 'Content-Type: application/json' -d '{"text":"The graph API is elegant and fast, but docs are sparse."}'
curl -X POST http://localhost:3000/stream -H 'Content-Type: application/json' -d '{"message":"Count from 1 to 5"}'

# The agent (currency / DB / GitHub via MCP):
curl -X POST http://localhost:3000/agent -H 'Content-Type: application/json' -d '{"message":"Convert 100 USD to EUR"}'
```

## Setup / env vars

| Variable            | Required                            | Description                                                                                                   |
| ------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`    | yes (model routes)                  | OpenAI key for GPT-4o-mini                                                                                    |
| `DATABASE_URL`      | yes                                 | PostgreSQL connection string (Neon, RDS; works with the `queryDatabase`/`getDatabaseSchema` tools and Prisma) |
| `FREE_CURRENCY_KEY` | no (unless using the currency tool) | Free Currency API key (freecurrencyapi.com)                                                                   |
| `GITHUB_AUTH_TOKEN` | no                                  | GitHub token for the MCP GitHub tools; if omitted the agent still runs with local tools only                  |

## Architecture

```
POST /agent
  └─ agent.ts  ──  createAgent(model, tools)
       ├─ tools/currencyTool.ts    ──  Free Currency API
       ├─ tools/databaseTool.ts    ──  Prisma → PostgreSQL
       │     └─ lib/prisma.ts      ──  PrismaPg adapter (Prisma 7)
       └─ MultiServerMCPClient     ──  MCP servers (GitHub, opt-in)

POST /graph | /reducers | /conditional | /parallel | /subgraph | /supervisor
  └─ server.ts  ──  StateGraph + Annotation (deterministic, no LLM)

POST /memory | /stream | /structured
  └─ server.ts  ──  StateGraph + MemorySaver / withStructuredOutput (LLM)

POST /interrupt
  └─ server.ts  ──  interrupt() + Command({ resume })
```

- **`server.ts`** — Express entry point, loads env vars, defines every concept route.
- **`agent.ts`** — Builds the prebuilt ReAct agent (LLM + local tools + opt-in MCP tools).
- **`tools/currencyTool.ts`** — Real-time currency conversion via Free Currency API.
- **`tools/databaseTool.ts`** — Two generic tools: schema introspection + read-only SQL.
- **`lib/prisma.ts`** — Prisma 7 client with the `PrismaPg` adapter for PostgreSQL.
- **`CONCEPTS.md`** — deep explanations with Mermaid diagrams and a concept→code map.

## Dependencies

| Package                                        | Purpose                                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `@langchain/langgraph`                         | the graph runtime (`StateGraph`, checkpointers, `interrupt`)                        |
| `langchain`                                    | the prebuilt agent (`createAgent` — non-deprecated successor of `createReactAgent`) |
| `@langchain/core`                              | messages, tools, runnables                                                          |
| `@langchain/openai`                            | the chat model                                                                      |
| `@langchain/mcp-adapters`                      | MCP (Model Context Protocol) client integration                                     |
| `@prisma/client` + `@prisma/adapter-pg` + `pg` | Prisma 7 ORM (Rust-free engine)                                                     |
| `zod`                                          | schema validation for tool inputs and structured output                             |
