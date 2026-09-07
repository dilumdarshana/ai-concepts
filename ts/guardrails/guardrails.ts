import { z } from 'zod';
import { RunnableLambda } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { CallbackHandler } from '@langfuse/langchain';

/**
 * Guardrail building blocks.
 *
 * A guardrail is a check that runs around a model call:
 *   - input guardrails  run BEFORE the model — reject or mutate the request
 *   - output guardrails run AFTER  the model — validate or flag the response
 *
 * Two mechanisms are demonstrated:
 *   1. Deterministic checks — regex / allowlists, zero cost, instant, no LLM.
 *   2. LLM-as-judge — a second model call that scores the first model's output.
 *
 * Guards that block throw a `GuardrailError`; routes catch it and return a
 * `400` with `{ blocked: true, guardrail, reason }`.
 */

// ---------------------------------------------------------------------------
// GuardrailError — thrown by any guard that blocks a request
// ---------------------------------------------------------------------------

export class GuardrailError extends Error {
  constructor(
    message: string,
    public readonly guardrail: string,
  ) {
    super(message);
    this.name = 'GuardrailError';
  }
}

// ---------------------------------------------------------------------------
// Input guardrails — run BEFORE the model call
// ---------------------------------------------------------------------------

// 1. Topic filter — allowlist rejection (cheap, deterministic, no LLM).
export const ALLOWED_TOPICS = [
  'technology',
  'science',
  'history',
  'health',
  'travel',
];

export const topicGuard = RunnableLambda.from(
  (input: { topic: string; message: string }) => {
    const topic = input.topic.toLowerCase();
    if (!ALLOWED_TOPICS.includes(topic)) {
      throw new GuardrailError(
        `Topic "${input.topic}" is not allowed. Allowed topics: ${ALLOWED_TOPICS.join(', ')}`,
        'topic',
      );
    }
    return input;
  },
);

// 2. Prompt injection detection — regex patterns for classic injection attempts.
// Deterministic and instant; production systems often add an LLM-based second
// stage for paraphrased attacks that regexes miss.
const INJECTION_PATTERNS: { name: string; regex: RegExp }[] = [
  {
    name: 'ignore-instructions',
    regex: /ignore (all )?(previous|prior|above) instructions/i,
  },
  { name: 'disregard-prompt', regex: /disregard (your|the) (system )?prompt/i },
  { name: 'reveal-prompt', regex: /reveal (your|the) (system )?prompt/i },
  {
    name: 'forget-instructions',
    regex: /forget (everything|all (your )?instructions)/i,
  },
  {
    name: 'override-role',
    regex: /you are now (a |an )?(dan|developer mode|unfiltered|jailbroken)/i,
  },
  { name: 'jailbreak', regex: /jailbreak/i },
];

export const injectionGuard = RunnableLambda.from(
  (input: { message: string }) => {
    for (const { name, regex } of INJECTION_PATTERNS) {
      if (regex.test(input.message)) {
        throw new GuardrailError(
          `Prompt injection detected (${name}).`,
          'injection',
        );
      }
    }
    return input;
  },
);

// 3. PII redaction — mutate the input before it reaches the model. Instead of
// blocking, this guard sanitizes: emails, phones, SSNs, and card numbers are
// replaced with placeholders so the model never sees raw PII.
const PII_PATTERNS: { name: string; regex: RegExp; replacement: string }[] = [
  {
    name: 'email',
    regex: /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g,
    replacement: '[EMAIL]',
  },
  {
    name: 'phone',
    regex: /\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[PHONE]',
  },
  { name: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN]' },
  {
    name: 'credit-card',
    regex: /\b(?:\d[ -]*?){13,16}\b/g,
    replacement: '[CREDIT_CARD]',
  },
];

export const redactPII = RunnableLambda.from((input: { message: string }) => {
  let message = input.message;
  const redacted: string[] = [];
  for (const { name, regex, replacement } of PII_PATTERNS) {
    if (regex.test(message)) {
      redacted.push(name);
      message = message.replace(regex, replacement);
    }
  }
  return { ...input, message, redacted };
});

// ---------------------------------------------------------------------------
// Output guardrails — run AFTER the model call
// ---------------------------------------------------------------------------

// Shared verdict shape — every LLM-as-judge returns this.
export const judgeSchema = z.object({
  score: z.number().min(0).max(10),
  passed: z.boolean(),
  reason: z.string(),
});

export type JudgeVerdict = z.infer<typeof judgeSchema>;

// 4. Output schema enforcement — `withStructuredOutput` guarantees the model
// returns a value matching this Zod schema, so downstream code never parses
// free-form text.
export const summarySchema = z.object({
  title: z.string(),
  summary: z.string(),
  keyPoints: z.array(z.string()).max(5),
  sentiment: z.enum(['positive', 'negative', 'neutral']),
});

// 5. LLM-as-judge — a second model call scores the first model's answer.
// The judge is a `withStructuredOutput` model bound to `judgeSchema`, so its
// verdict is machine-readable. This is the most flexible guardrail: it can
// check quality, tone, safety, or anything else you can describe.
export async function qualityJudge(
  strictModel: ChatOpenAI,
  {
    question,
    answer,
    minScore = 7,
  }: { question: string; answer: string; minScore?: number },
  callbacks?: CallbackHandler[],
): Promise<JudgeVerdict> {
  const judge = strictModel.withStructuredOutput(judgeSchema);
  return judge.invoke(
    [
      new SystemMessage(
        `You are a strict quality judge. Score the answer on clarity, correctness, and relevance to the question. Score 0-10. Pass if score >= ${minScore}.`,
      ),
      new HumanMessage(`Question: ${question}\n\nAnswer: ${answer}`),
    ],
    callbacks ? { callbacks } : {},
  );
}

// 6. Groundedness check — verify the answer is supported by the given context.
// Catches hallucination: if the answer asserts facts NOT in the context, it
// fails. The judge needs the context so it can compare, not just judge in a
// vacuum.
export async function groundednessJudge(
  strictModel: ChatOpenAI,
  { context, answer }: { context: string; answer: string },
  callbacks?: CallbackHandler[],
): Promise<JudgeVerdict> {
  const judge = strictModel.withStructuredOutput(judgeSchema);
  return judge.invoke(
    [
      new SystemMessage(
        'You verify whether an answer is grounded in the provided context. If the answer states facts NOT supported by the context, it is a hallucination — fail it. Score 0-10. Pass if score >= 7.',
      ),
      new HumanMessage(`Context:\n${context}\n\nAnswer:\n${answer}`),
    ],
    callbacks ? { callbacks } : {},
  );
}
