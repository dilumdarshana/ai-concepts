import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from '@huggingface/transformers';
import type { Chunk } from './retrieval.js';

/** A chunk with an added cross-encoder relevance score in [0, 1]. */
export interface RerankedChunk extends Chunk {
  rerankScore: number;
}

// Singleton model state. `loading` deduplicates concurrent load() calls so
// two simultaneous requests can't both trigger a download.
let tokenizer: PreTrainedTokenizer | null = null;
let model: PreTrainedModel | null = null;
let loading: Promise<void> | null = null;

export function rerankerModel(): string {
  return process.env.RERANKER_MODEL || 'Xenova/ms-marco-MiniLM-L-6-v2';
}

export function isRerankerReady(): boolean {
  return model !== null && tokenizer !== null;
}

/**
 * Loads the cross-encoder once, lazily, and caches it for the process
 * lifetime. First call downloads ~90MB of ONNX weights (q8-quantized) into
 * .cache/; subsequent runs load from disk.
 */
async function load(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const name = rerankerModel();
      tokenizer = await AutoTokenizer.from_pretrained(name);
      // q8: 8-bit quantization — ~4x smaller/faster than fp32 with negligible
      // quality loss for this 22M-parameter model.
      model = await AutoModelForSequenceClassification.from_pretrained(name, { dtype: 'q8' });
    })();
  }
  return loading;
}

/**
 * Optional warm-up: called at server startup so the first user request
 * doesn't pay the download/load cost.
 */
export async function preloadReranker(): Promise<void> {
  await load();
}

/**
 * Reranks chunks with a CROSS-ENCODER — the second stage of the classic
 * retrieve-then-rerank pipeline.
 *
 * Bi-encoder retrieval (dense/sparse) embeds query and document INDEPENDENTLY,
 * which is fast enough to scan a corpus but loses interaction between their
 * words. A cross-encoder instead feeds "query + document" through ONE
 * transformer that attends across both jointly — far more accurate per pair,
 * but too slow to run over a whole corpus. Hence: cheap retriever narrows
 * ~N docs to ~10 candidates, the cross-encoder only scores those.
 *
 * transformers.js v4 API note: query/document pairs go in the tokenizer's
 * OPTIONS object (`text_pair`), passed as parallel arrays — one tokenized
 * pair per candidate.
 */
export async function rerank(
  query: string,
  chunks: Chunk[],
  topN?: number,
): Promise<RerankedChunk[]> {
  if (chunks.length === 0) return [];

  await load();
  const inputs = tokenizer!(chunks.map(() => query), {
    text_pair: chunks.map((chunk) => chunk.text ?? ''),
    padding: true,
    truncation: true,
  });
  const output = await model!(inputs);
  // One logit per input pair; higher = more relevant. Raw range is roughly
  // -11..+10 depending on lexical overlap between query and document.
  const logits = output.logits.tolist() as number[][];

  // Sigmoid squashes each logit into a 0..1 pseudo-probability so consumers
  // get interpretable scores (~0.99 strong match, ~0.00 irrelevant) instead
  // of raw logits like -9.43.
  const scored = chunks.map((chunk, i) => ({
    ...chunk,
    rerankScore: 1 / (1 + Math.exp(-(Number(logits[i]?.[0] ?? 0)))),
  }));
  scored.sort((a, b) => b.rerankScore - a.rerankScore);
  return topN ? scored.slice(0, topN) : scored;
}
