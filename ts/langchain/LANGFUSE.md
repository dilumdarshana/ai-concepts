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
10. [Design Decisions](#design-decisions)
11. [Troubleshooting](#troubleshooting)
12. [Useful Links](#useful-links)

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
| `@opentelemetry/sdk-trace-node` | `^2.11.0` | — |

---

## Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `LANGFUSE_PUBLIC_KEY` | Yes | — | Public API key (`pk-lf-...`) |
| `LANGFUSE_SECRET_KEY` | Yes | — | Secret API key (`sk-lf-...`) |
| `LANGFUSE_BASE_URL` | No | `https://cloud.langfuse.com` | Langfuse server URL. Use `https://us.cloud.langfuse.com` for US region. |

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

The entire integration lives in a single file (`langfuse.ts`, 64 lines). Here is
how it works:

### Lazy singleton initialization

```ts
let langfuseHandler: CallbackHandler | undefined;

function getLangfuseHandler(): CallbackHandler | undefined {
  if (langfuseHandler !== undefined) return langfuseHandler;  // cached

  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return undefined;  // keys missing → no tracing
  }

  // Register the OTel provider once (process-wide singleton)
  new NodeTracerProvider({
    spanProcessors: [new LangfuseSpanProcessor()],
  }).register();

  // Create and cache the handler
  langfuseHandler = new CallbackHandler();
  return langfuseHandler;
}
```

Key points:

- **Lazy**: nothing happens until the first `langfuseCallbacks()` call.
- **Singleton**: `NodeTracerProvider` and `CallbackHandler` are created once and
  reused for all subsequent invocations.
- **Opt-out by omission**: missing env vars → `undefined` → empty config → no
  tracing.

### The exported `langfuseCallbacks()` helper

```ts
export function langfuseCallbacks(options?: {
  sessionId?: string;
  userId?: string;
}): { callbacks?: CallbackHandler[] } {
  const handler = getLangfuseHandler();
  if (!handler) return {};

  // Session/user → new handler per call (metadata baked in at construction)
  if (options?.sessionId || options?.userId) {
    return { callbacks: [new CallbackHandler(options)] };
  }

  // Default → cached singleton handler
  return { callbacks: [handler] };
}
```

Two modes:

| Mode | When | Handler |
|---|---|---|
| Default | No options | Cached singleton — lightweight, shared |
| Session/user | `sessionId` or `userId` provided | New `CallbackHandler` per call — metadata must be baked in at construction |

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

## Design Decisions

1. **Zero-cost when unconfigured** — spreading `{}` into a LangChain config is a
   no-op. The app behaves identically whether Langfuse is set up or not.

2. **Per-invocation, not per-model** — callbacks are passed to each `.invoke()`,
   not attached to the `ChatOpenAI` instance. This means each HTTP request
   produces its own trace, giving per-request observability.

3. **Singleton for default, new instance for sessions** — the cached
   `CallbackHandler` avoids re-allocation on every request. A fresh handler is
   only created when session/user metadata must be baked in at construction time.

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
| High memory usage | Creating new `CallbackHandler` per request without session | Use the default path (no options) which caches the handler |

---

## Useful Links

- [Langfuse Docs](https://langfuse.com/docs)
- [LangChain Integration](https://langfuse.com/docs/integrations/langchain)
- [OpenTelemetry Integration](https://langfuse.com/docs/integrations/opentelemetry)
- [Self-hosting](https://langfuse.com/docs/deployment/self-host)
- [API Keys](https://langfuse.com/docs/api-reference)
