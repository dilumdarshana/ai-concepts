# Langfuse — Project Reference

Langfuse is an open-source LLM observability platform. This project integrates it
with LangChain via two complementary mechanisms: LangChain's callback system and
OpenTelemetry (OTel) span export.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Package Dependency Map](#package-dependency-map)
3. [Environment Variables](#environment-variables)
4. [Core Wiring — `langfuse.ts`](#core-wiring--langfuets)
5. [How Tracing Works](#how-tracing-works)
6. [Session and User Tracking](#session-and-user-tracking)
7. [Usage Patterns](#usage-patterns)
8. [What Appears in the Langfuse UI](#what-appears-in-the-langfuse-ui)
9. [Sample Code Recipes](#sample-code-recipes)
10. [LLM-as-Judge](#llm-as-judge)
11. [Design Decisions](#design-decisions)
12. [Troubleshooting](#troubleshooting)
13. [Useful Links](#useful-links)

---

## Architecture Overview

```
HTTP request
 └─ LangChain .invoke(input, config)
     └─ CallbackHandler  (@langfuse/langchain)
         │  Hooks LangChain run events (LLM start/end, tool start/end, chain start/end)
         │  Converts each run into an OTel span
         └─ LangfuseSpanProcessor  (@langfuse/otel)
              │  Collects spans from the NodeTracerProvider
              └─ Exports spans to Langfuse backend over HTTP
```

Three layers are involved:

| Layer | Package | Role |
|---|---|---|
| **LangChain callbacks** | `@langfuse/langchain` | Listens to LangChain lifecycle events and converts them to OTel spans |
| **OTel bridge** | `@langfuse/tracing` (transitive) | Converts LangChain callback events into standard OTel span data |
| **OTel export** | `@langfuse/otel` + `@opentelemetry/sdk-trace-node` | Collects and batches spans, then exports them to the Langfuse HTTP API |

---

## Package Dependency Map

```
@langfuse/langchain  ^5.11.0
 ├── @langfuse/core    ^5.11.0   (HTTP client, config)
 └── @langfuse/tracing ^5.11.0   (LangChain → OTel conversion)

@langfuse/otel        ^5.11.0
 └── @langfuse/core    ^5.11.0

@opentelemetry/sdk-trace-node  ^2.11.0   (NodeTracerProvider)
 @opentelemetry/sdk-trace-base            (span processing)
 @opentelemetry/api                       (OTel API)
 @opentelemetry/core                      (OTel core utilities)
 @opentelemetry/exporter-trace-otlp-http  (OTLP HTTP exporter)
```

**Peer dependencies** (required but not bundled):

| Package | Version |
|---|---|
| `@opentelemetry/api` | `^1.9.0` |
| `@opentelemetry/core` | `^2.0.1` |
| `@opentelemetry/exporter-trace-otlp-http` | `>=0.202.0 <1.0.0` |
| `@opentelemetry/sdk-trace-base` | `^2.0.1` |
| `@langchain/core` | `>=0.3.8` |

**Direct dependencies in `package.json`:**

| Package | Declared | Installed |
|---|---|---|
| `@langfuse/langchain` | `^5.11.0` | `5.11.0` |
| `@langfuse/otel` | `^5.11.0` | `5.11.0` |
| `@langfuse/client` | `^5.11.1` | `5.11.1` |
| `@opentelemetry/sdk-trace-node` | `^2.11.0` | — |

`@langfuse/client` is only used by `judge.ts` to ingest scores (see
[LLM-as-Judge](#llm-as-judge)); tracing itself does not require it.

---

## Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `LANGFUSE_PUBLIC_KEY` | Yes | — | Public API key (`pk-lf-...`) |
| `LANGFUSE_SECRET_KEY` | Yes | — | Secret API key (`sk-lf-...`) |
| `LANGFUSE_BASE_URL` | No | `https://cloud.langfuse.com` | Langfuse server URL. Use `https://us.cloud.langfuse.com` for US region. |
| `LANGFUSE_TRACING_ENVIRONMENT` | No | `default` | Environment tag on every trace (`development`, `production`, …). |
| `LANGFUSE_RELEASE` | No | — | Release/app version tag, e.g. a git SHA. |

Both `PUBLIC_KEY` and `SECRET_KEY` must be present to enable tracing. If either
is missing, the entire Langfuse integration is skipped — zero overhead, zero
behaviour change.

Copy `.env_example` → `.env` and fill in your keys:

```
LANGFUSE_PUBLIC_KEY=pk-lf-xxxxxxxxxxxxxxxx
LANGFUSE_SECRET_KEY=sk-lf-xxxxxxxxxxxxxxxx
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

---

## Core Wiring — `langfuse.ts`

The entire integration lives in a single file (`langfuse.ts`). Here is how it
works:

### Lazy, process-wide initialization

```ts
let langfuseProcessor: LangfuseSpanProcessor | undefined;
let initialized = false;

function initLangfuse(): LangfuseSpanProcessor | undefined {
  if (initialized) return langfuseProcessor;  // cached
  initialized = true;

  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return undefined;  // keys missing → no tracing
  }

  // Register the OTel provider once (process-wide singleton)
  const processor = new LangfuseSpanProcessor();
  new NodeTracerProvider({ spanProcessors: [processor] }).register();

  registerShutdownFlush(processor);

  langfuseProcessor = processor;
  return processor;
}
```

Key points:

- **Lazy**: nothing happens until the first `langfuseCallbacks()` call.
- **Provider is a singleton**: `NodeTracerProvider` + `LangfuseSpanProcessor` are
  created once and reused. This is required — the OTel provider is global.
- **Handler is per-call**: a fresh `CallbackHandler` is built for every
  invocation (see below), so no per-run state is shared.
- **Opt-out by omission**: missing env vars → `undefined` → empty config → no
  tracing.

### The exported `langfuseCallbacks()` helper

```ts
export interface LangfuseCallbackOptions {
  sessionId?: string;
  userId?: string;
  tags?: string[];
  version?: string;
  traceMetadata?: Record<string, unknown>;
}

export function langfuseCallbacks(
  options: LangfuseCallbackOptions = {},
): { callbacks?: CallbackHandler[] } {
  const processor = initLangfuse();
  if (!processor) return {};

  return { callbacks: [new CallbackHandler(options)] };
}
```

A new handler is created on every call. `CallbackHandler` keeps per-run state
(`runMap`, completion start times, `last_trace_id`), so sharing one instance
across concurrent HTTP requests can mix trace data. The cost of a new instance
is negligible.

### Flushing on shutdown

`LangfuseSpanProcessor` batches spans before exporting. If the process exits
before the batch flushes, recent traces are lost. The module registers hooks to
flush on exit:

```ts
process.once('beforeExit', () => void flush());
process.once('SIGINT', () => void flush().finally(() => process.kill(process.pid, 'SIGINT')));
process.once('SIGTERM', () => void flush().finally(() => process.kill(process.pid, 'SIGTERM')));
```

`flush()` calls `processor.shutdown()`, which drains the queue and releases
resources. The signal handlers re-raise the signal afterwards so Node's default
exit behaviour is preserved.

---

## How Tracing Works

### Per-invocation traces

Each `.invoke()` or `.stream()` call creates its own **root span**, which becomes
a **trace** in the Langfuse UI. The trace boundary is the HTTP request.

```
POST /prompt → model.invoke(messages, langfuseCallbacks())
                └─ Langfuse trace (one per request)
```

### Span hierarchy

LangChain fires nested callbacks that map to a span tree:

```
Trace (POST /tools)
 ├─ LLMCall (model.invoke #1 — decides to use a tool)
 │   └─ ChatOpenAI (the actual API call)
 ├─ ToolCall (multiply(2, 3))
 └─ LLMCall (model.invoke #2 — summarizes the tool result)
     └─ ChatOpenAI
```

### Streaming

For `.stream()` calls, the trace captures token-by-token latency:

```
Trace (POST /stream)
 └─ LLMStream
     ├─ token 1
     ├─ token 2
     └─ ...
```

---

## Session and User Tracking

### Grouping traces into sessions

Pass `sessionId` (typically a conversation `thread_id`) to group all traces
belonging to one conversation under a single **session timeline** in the Langfuse
UI.

```ts
const response = await graph.invoke(
  { messages },
  {
    configurable: { thread_id },
    ...langfuseCallbacks({ sessionId: thread_id }),
  },
);
```

### User tracking

Pass `userId` to associate traces with a specific user:

```ts
const response = await model.invoke(
  messages,
  langfuseCallbacks({ userId: 'user-123' }),
);
```

### Both together

```ts
langfuseCallbacks({ sessionId: thread_id, userId: 'user-123' })
```

### Tags, version, and metadata

The helper also accepts `tags`, `version`, and `traceMetadata`:

```ts
langfuseCallbacks({
  sessionId: thread_id,
  tags: ['route:/chat', 'production'],
  version: 'v1.2.0',
  traceMetadata: { feature: 'rag', locale: 'en' },
});
```

These map directly to `CallbackHandler` constructor params and surface as
filterable attributes in the Langfuse UI.

---

## Usage Patterns

### Pattern 1 — Simple invoke (most routes)

```ts
import { langfuseCallbacks } from './langfuse.js';

const response = await model.invoke(messages, langfuseCallbacks());
```

### Pattern 2 — Chain with input variables

```ts
const chain = prompt.pipe(model);

const response = await chain.invoke(
  { topic: 'black holes', audience: 'children' },
  langfuseCallbacks(),
);
```

### Pattern 3 — Streaming

```ts
const stream = await chain.stream(
  { message: 'Tell me a joke' },
  langfuseCallbacks(),
);

for await (const chunk of stream) {
  process.stdout.write(chunk.content);
}
```

### Pattern 4 — Session-grouped (LangGraph with memory)

```ts
import { langfuseCallbacks } from './langfuse.js';

const response = await memoryGraph.invoke(
  { skill, message },
  {
    configurable: { thread_id },
    ...langfuseCallbacks({ sessionId: thread_id }),
  },
);
```

Note: `langfuseCallbacks()` returns a spreadable `{ callbacks: [...] }` object.
Spread it into the config alongside your own config keys.

### Pattern 5 — Tool-calling agent

```ts
const toolModel = model.bindTools(tools);

const response = await toolModel.invoke(messages, langfuseCallbacks());
// Langfuse captures: LLM call → tool execution → follow-up LLM call
```

---

## What Appears in the Langfuse UI

| Route | What you see |
|---|---|
| `/messages` | Single LLM call trace |
| `/prompt` | Single LLM call with prompt template metadata |
| `/chat-prompt` | Single LLM call with chat prompt template |
| `/structured` | LLM call with structured output (JSON mode) |
| `/chain` | LLM chain (prompt → model → output parser) |
| `/lc` | Custom chain (echo + count functions) |
| `/stream` | LLM stream with token-by-token timing |
| `/tools` | Nested: LLM → tool call → LLM |
| `/memory` | StateGraph node → LLM, grouped under one session |
| `/judge` | LLM call with an `llm-judge` numeric score attached |
| `/trim` | No trace (no LangChain model call) |

---

## Sample Code Recipes

### Enabling tracing for a new route

```ts
import { langfuseCallbacks } from './langfuse.js';
import { model } from './model.js';

app.post('/my-new-route', async (req, res) => {
  const { message } = req.body;

  const response = await model.invoke(
    [{ role: 'user', content: message }],
    langfuseCallbacks(),  // ← add this
  );

  res.json({ response: response.content });
});
```

### Adding session tracking to an existing route

```ts
app.post('/my-chat', async (req, res) => {
  const { message, threadId } = req.body;

  const response = await model.invoke(
    [{ role: 'user', content: message }],
    langfuseCallbacks({ sessionId: threadId }),  // ← groups traces by thread
  );

  res.json({ response: response.content });
});
```

### Creating a Langfuse handler manually (advanced)

If you need full control:

```ts
import { CallbackHandler } from '@langfuse/langchain';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';

// One-time setup
new NodeTracerProvider({
  spanProcessors: [new LangfuseSpanProcessor()],
}).register();

// Per-request handler
const handler = new CallbackHandler({
  sessionId: 'my-session',
  userId: 'user-42',
  metadata: { route: '/custom' },
  tags: ['production'],
});

await model.invoke(messages, { callbacks: [handler] });
```

### Disabling tracing at runtime

Simply remove `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` from `.env`.
No code changes needed — `langfuseCallbacks()` returns `{}` automatically.

---

## LLM-as-Judge

LLM-as-a-Judge uses a second model (the "judge") to grade an answer against a
rubric and records the result as a **score** on the trace. There are two ways to
do this with Langfuse:

| Approach | Runs where | Code needed | Best for |
|---|---|---|---|
| **UI-managed evaluator** | Langfuse server | None | Production monitoring at scale |
| **In-app judge** | Your app | `judge.ts` | Concepts, custom rubrics, immediate feedback |

This project implements the **in-app judge** (`judge.ts` + `POST /judge`).

> Note: Langfuse is deprecating **trace-level** evaluators in favour of
> **observation-level** evaluators. The in-app approach here attaches a score to
> the trace ID directly, which remains supported via the scores API.

### The `/judge` route

```bash
curl -X POST http://localhost:3000/judge \
  -H "Content-Type: application/json" \
  -d '{ "message": "Explain vector databases in one sentence." }'
```

Response:

```json
{
  "response": "A vector database stores data as embeddings ...",
  "judgement": { "score": 0.9, "reasoning": "Accurate and concise." },
  "traceId": "8f2c...e91"
}
```

### How it works

```
POST /judge
 ├─ createLangfuseHandler({ tags: ['route:/judge'] })   → handler
 ├─ model.invoke(messages, { callbacks: [handler] })     → traced answer
 ├─ await awaitAllCallbacks()                            → drain background callbacks
 ├─ handler.last_trace_id                                → the trace to score
 ├─ await flushLangfuse()                                → export the trace now
 ├─ judgeResponse({ input, output, traceId })            → judge model (Zod schema)
 │    └─ langfuse.score.create({ traceId, name, value, dataType, comment })
 └─ res.json({ response, judgement, traceId })
```

Key pieces:

- **`createLangfuseHandler()`** (`langfuse.ts`) — returns the `CallbackHandler`
  so you can read `last_trace_id`. `langfuseCallbacks()` is the spread-friendly
  wrapper for the common case.
- **`await awaitAllCallbacks()`** — LangChain runs callbacks in the background,
  so `last_trace_id` is only populated after they drain. Without this you may
  read `null`.
- **`await flushLangfuse()`** — exports the just-finished trace immediately
  instead of waiting for the batch interval, so the trace exists in Langfuse
  before the score is attached.
- **`judgeResponse()`** (`judge.ts`) — a `temperature: 0` model constrained with
  `withStructuredOutput` to `{ score: 0..1, reasoning: string }`.
- **`client.score.create(...)`** — writes the score back to the original trace;
  `client.score.flush()` sends it immediately.

### Score types

`score.create` accepts four data types:

```ts
client.score.create({
  traceId,
  name: 'correctness',
  value: 0.9,          // numeric: float
  dataType: 'NUMERIC',
  comment: 'Factually correct',
});

// CATEGORICAL → string value (e.g. 'correct' | 'partially_correct')
// BOOLEAN     → 0 or 1
// TEXT        → string, 1–500 chars
```

Attach to a specific observation with `observationId`, or to a session with
`sessionId` instead of `traceId`.

### UI-managed evaluator (no code)

1. Configure an [LLM Connection](https://langfuse.com/docs/administration/llm-connection)
   in Langfuse (provider + key).
2. Create an **LLM-as-a-Judge evaluator** with a rubric and a score type.
3. Add a **rule** to run it on matching observations (filter by trace name, tag,
   `userId`, `sessionId`, etc.).
4. Optionally use the [Evaluators API](https://api.reference.langfuse.com/#tag/evaluators)
   to version-control the setup.

The `/judge` route tags its trace `route:/judge`, which makes a good rule filter.

---

## Design Decisions

1. **Zero-cost when unconfigured** — spreading `{}` into a LangChain config is a
   no-op. The app behaves identically whether Langfuse is set up or not.

2. **Per-invocation, not per-model** — callbacks are passed to each `.invoke()`,
   not attached to the `ChatOpenAI` instance. This means each HTTP request
   produces its own trace, giving per-request observability.

3. **Handler per call, provider per process** — the OTel provider/processor is a
   process-wide singleton (required), but a new `CallbackHandler` is created for
   every invocation. The handler is stateful, so per-call instances prevent
   trace data from mixing across concurrent requests.

4. **OTel provider registered once** — `NodeTracerProvider.register()` is
   process-wide. Calling it again is harmless but the guard ensures no duplicate
   registration.

5. **`LANGFUSE_BASE_URL` not checked in code** — the env var is read internally
   by `LangfuseSpanProcessor` and `CallbackHandler`. Our gate only checks the two
   required keys.

6. **Spreadable return type** — `langfuseCallbacks()` returns
   `{ callbacks?: CallbackHandler[] }` so it can be spread inline:
   `invoke(input, langfuseCallbacks())` or merged with other config:
   `{ configurable: { thread_id }, ...langfuseCallbacks({ sessionId }) }`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| No traces in Langfuse UI | `LANGFUSE_PUBLIC_KEY` or `LANGFUSE_SECRET_KEY` missing | Add both to `.env` |
| Traces going to wrong project | Wrong keys in `.env` | Verify key prefix matches your Langfuse project (`pk-lf-...`) |
| US region traces not showing | `LANGFUSE_BASE_URL` defaults to EU | Set `LANGFUSE_BASE_URL=https://us.cloud.langfuse.com` |
| Session traces not grouped | Missing `sessionId` in `langfuseCallbacks()` | Pass `{ sessionId: threadId }` |
| Duplicate spans | Calling `NodeTracerProvider.register()` multiple times | The singleton guard prevents this — ensure you're using the `langfuseCallbacks()` helper |
| Traces missing after restart | Batched spans not flushed before exit | Shutdown hooks are registered automatically; don't call `process.exit()` without flushing |
| Traces missing environment tag | `LANGFUSE_TRACING_ENVIRONMENT` unset | Set it in `.env` (`development`, `production`, …) |

---

## Useful Links

- [Langfuse Docs](https://langfuse.com/docs)
- [LangChain Integration](https://langfuse.com/docs/integrations/langchain)
- [OpenTelemetry Integration](https://langfuse.com/docs/integrations/opentelemetry)
- [Self-hosting](https://langfuse.com/docs/deployment/self-host)
- [API Keys](https://langfuse.com/docs/api-reference)
