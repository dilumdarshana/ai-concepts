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
 *
 * Optional env vars (read internally by `LangfuseSpanProcessor`):
 *   LANGFUSE_BASE_URL            — instance URL (default: EU cloud)
 *   LANGFUSE_TRACING_ENVIRONMENT — e.g. "development" / "production"
 *   LANGFUSE_RELEASE             — app version / git sha
 */

export interface LangfuseCallbackOptions {
  /** Groups every trace of one conversation under a single session. */
  sessionId?: string;
  /** Associates the trace with an end user. */
  userId?: string;
  /** Free-form tags for filtering in the Langfuse UI. */
  tags?: string[];
  /** Version of the app / prompt, for A/B comparison. */
  version?: string;
  /** Arbitrary metadata attached to the trace. */
  traceMetadata?: Record<string, unknown>;
}

let langfuseProcessor: LangfuseSpanProcessor | undefined;
let initialized = false;

function initLangfuse(): LangfuseSpanProcessor | undefined {
  if (initialized) return langfuseProcessor;
  initialized = true;

  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return undefined;
  }

  // Register the span processor once per process. It reads the LANGFUSE_* env
  // vars, including BASE_URL / TRACING_ENVIRONMENT / RELEASE.
  const processor = new LangfuseSpanProcessor();
  new NodeTracerProvider({ spanProcessors: [processor] }).register();

  registerShutdownFlush(processor);

  langfuseProcessor = processor;
  return processor;
}

/**
 * Spans are batched before export, so flush the queue before the process exits —
 * otherwise traces from the last few seconds are lost on restart.
 */
function registerShutdownFlush(processor: LangfuseSpanProcessor): void {
  const flush = async (): Promise<void> => {
    await processor.shutdown().catch(() => undefined);
  };

  process.once('beforeExit', () => void flush());

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGUSR2'] as const) {
    process.once(signal, () => {
      // Re-raise after flushing so Node's default signal handling still runs.
      // SIGUSR2 is included because nodemon uses it to restart the child.
      void flush().finally(() => process.kill(process.pid, signal));
    });
  }
}

/**
 * Force-flush queued spans so the current trace is exported immediately instead
 * of waiting for the batch interval. Used before attaching a score so the trace
 * exists in Langfuse when the score arrives.
 */
export async function flushLangfuse(): Promise<void> {
  if (!langfuseProcessor) return;
  await langfuseProcessor.forceFlush().catch(() => undefined);
}

/**
 * Create a `CallbackHandler` for a single invocation, or `undefined` when
 * Langfuse is not configured.
 *
 * Use this directly when you need the handler afterwards — e.g. to read
 * `handler.last_trace_id` and attach a score to the trace (see `judge.ts`).
 * Remember to `await awaitAllCallbacks()` first: LangChain runs callbacks in
 * the background, so `last_trace_id` is only set once they drain.
 *
 * A fresh handler is created per call: `CallbackHandler` keeps per-run state, so
 * sharing one instance across concurrent requests can mix traces.
 */
export function createLangfuseHandler(
  options: LangfuseCallbackOptions = {},
): CallbackHandler | undefined {
  const processor = initLangfuse();
  if (!processor) return undefined;

  return new CallbackHandler(options);
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
export function langfuseCallbacks(
  options: LangfuseCallbackOptions = {},
): {
  callbacks?: CallbackHandler[];
} {
  const handler = createLangfuseHandler(options);
  return handler ? { callbacks: [handler] } : {};
}
