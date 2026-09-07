import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { CallbackHandler } from '@langfuse/langchain';

/**
 * Langfuse observability — wiring.
 *
 * LangChain has its own callback system; Langfuse listens to it through a
 * `CallbackHandler`. Each LangChain span is created with OpenTelemetry
 * (`@langfuse/tracing`), so the `LangfuseSpanProcessor` (registered on the
 * global `NodeTracerProvider`) is what actually exports those spans to Langfuse.
 *
 * Tracing is opt-in: if `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` are not
 * set, this wrapper returns no callbacks and the app runs exactly as before.
 */

let langfuseHandler: CallbackHandler | undefined;

function getLangfuseHandler(): CallbackHandler | undefined {
  if (langfuseHandler !== undefined) return langfuseHandler;

  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return undefined;
  }

  // Register the Langfuse span processor once at process start so every span
  // created by the CallbackHandler is flushed to Langfuse (reads the
  // LANGFUSE_* env vars — pinned to the Langfuse project).
  new NodeTracerProvider({
    spanProcessors: [new LangfuseSpanProcessor()],
  }).register();

  // One handler reused across invocations; each invocation becomes its own trace.
  langfuseHandler = new CallbackHandler();
  return langfuseHandler;
}

/**
 * LangChain callbacks to attach to an invocation config.
 *
 * Spread it into the invocation's second argument:
 *   `chain.invoke(input, langfuseCallbacks())`
 * Returns `{}` when Langfuse is not configured, so tracing is purely additive.
 *
 * Pass `{ sessionId }` (e.g. a conversation `thread_id`) to group every trace
 * of that conversation under one session in the Langfuse UI.
 */
export function langfuseCallbacks(options?: {
  sessionId?: string;
  userId?: string;
}): {
  callbacks?: CallbackHandler[];
} {
  const handler = getLangfuseHandler();
  if (!handler) return {};

  if (options?.sessionId || options?.userId) {
    // Per-request handler so this invocation's trace is tagged with the
    // conversation session — a whole thread groups under one session.
    return { callbacks: [new CallbackHandler(options)] };
  }

  return { callbacks: [handler] };
}
