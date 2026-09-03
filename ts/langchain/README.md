# LangChain

Express server that demos the major LangChain concepts — one route per concept, so it doubles as a reference for future projects.

## Prerequisites

- OpenAI API key
- (Optional) Langfuse account for observability/tracing — [free cloud](https://cloud.langfuse.com) or self-hosted

## Setup

```sh
# From workspace root (ts/)
pnpm install

# Copy and configure environment
cp langchain/.env_example langchain/.env
# Edit .env with your OPENAI_API_KEY
```

## Run

```sh
pnpm dev:langchain
```

Server starts on `http://localhost:3000`. `GET /` lists all concept routes.

## Observability (Langfuse)

Every route is traced automatically when Langfuse is configured. Each request produces a trace in [Langfuse Cloud](https://cloud.langfuse.com) (or your self-hosted instance) showing model calls, latency, token usage, and cost — with zero code changes per route.

**Setup (optional):**

```sh
# Add to ts/langchain/.env
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com   # EU default; use us.cloud.langfuse.com for US
```

Tracing is **off by default** — the app runs identically without these keys.

**What you see:**

- Each `POST /<route>` → one Langfuse trace (under the Traces tab).
- `/tools` shows the multiply/add tool loop as nested spans under the model call.
- `/memory` shows the `StateGraph` node + model call, all nested under one trace.
- `/stream` shows token-by-token streaming latency.

**Architecture:** `CallbackHandler` (`@langfuse/langchain`) listens to LangChain's callbacks → creates OTel spans (`@langfuse/tracing`) → exported by `LangfuseSpanProcessor` (`@langfuse/otel`) to your Langfuse project. See `langfuse.ts` and `CONCEPTS.md §12` for the full wiring.

## Concept routes

Each route demonstrates exactly one LangChain concept:

| Route | Concept | What you'll see |
|---|---|---|
| `GET /` | index | List of all routes |
| `/messages` | Message roles | `SystemMessage`/`HumanMessage`, role boundaries |
| `/prompt` | `PromptTemplate` | string prompt with `{variable}` placeholders |
| `/chat-prompt` | `ChatPromptTemplate` | role-tagged messages + `MessagesPlaceholder` |
| `/structured` | `withStructuredOutput` | Zod-schema-typed model output |
| `/chain` | LCEL | `prompt.pipe(model).pipe(parser)` + `RunnableSequence` |
| `/lc` | Runnable primitives | `RunnablePassthrough.assign` + `RunnableLambda` |
| `/stream` | Streaming | token-by-token plain-text stream (`res.write`) |
| `/tools` | Tool calling | `@tool` + `bindTools` + `ToolMessage` loop |
| `/memory` | LangGraph | `StateGraph` + `MemorySaver` (persistent `thread_id`) |
| `/trim` | Message trimming | `trimMessages` bounds a growing history |

### Examples

```sh
# Prompt variable
curl -X POST localhost:3000/prompt -H "Content-Type: application/json" \
  -d '{"topic":"RAG","audience":"beginners"}'

# Streaming (plain-text tokens)
curl -N -X POST localhost:3000/stream -H "Content-Type: application/json" \
  -d '{"message":"Count 1 to 5"}'

# Tool calling — the model decides to call `multiply`
curl -X POST localhost:3000/tools -H "Content-Type: application/json" \
  -d '{"message":"What is 7 times 8?"}'

# Memory — same thread_id recalls prior turns
curl -X POST localhost:3000/memory -H "Content-Type: application/json" \
  -d '{"message":"My name is Dilum"}'
curl -X POST localhost:3000/memory -H "Content-Type: application/json" \
  -d '{"message":"What is my name?"}'
```

## Testing

Use `test.rest` (VS Code REST Client) or curl to test each route. Routes that call OpenAI need a valid `OPENAI_API_KEY` in `.env`.
