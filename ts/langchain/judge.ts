import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { LangfuseClient } from '@langfuse/client';
import { z } from 'zod';

/**
 * LLM-as-a-judge — grade an answer with a second model and record the result in
 * Langfuse as a score on the original trace.
 *
 * The judge is a deterministic (`temperature: 0`) model constrained to a Zod
 * schema, so it returns a numeric score plus reasoning. The score is attached to
 * the traced invocation via `traceId` (read from the `CallbackHandler`).
 */

const judgementSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe('Quality from 0 (poor) to 1 (excellent).'),
  reasoning: z.string().describe('One or two sentences justifying the score.'),
});

export type Judgement = z.infer<typeof judgementSchema>;

// Built lazily so `dotenv.config()` (run in server.ts) has loaded the env first.
function buildJudgeModel() {
  return new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-5',
    temperature: 0,
  }).withStructuredOutput(judgementSchema);
}

let judgeModel: ReturnType<typeof buildJudgeModel> | undefined;

function getJudgeModel(): ReturnType<typeof buildJudgeModel> {
  judgeModel ??= buildJudgeModel();
  return judgeModel;
}

let langfuse: LangfuseClient | undefined;

function getLangfuseClient(): LangfuseClient | undefined {
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return undefined;
  }
  langfuse ??= new LangfuseClient();
  return langfuse;
}

export interface JudgeParams {
  /** The user's original question. */
  input: string;
  /** The assistant's answer to grade. */
  output: string;
  /** Trace to attach the score to. When omitted, nothing is recorded. */
  traceId?: string | null;
  /** What to evaluate, woven into the rubric. */
  criteria?: string;
}

export async function judgeResponse({
  input,
  output,
  traceId,
  criteria = 'helpfulness, accuracy, and clarity',
}: JudgeParams): Promise<Judgement> {
  const judgement = await getJudgeModel().invoke([
    new SystemMessage(
      `You are a strict but fair evaluator. Score the assistant's answer from 0 to 1 on ${criteria}. ` +
      'Use the full range: 1 is excellent, 0 is unusable.',
    ),
    new HumanMessage(
      `User question:\n${input}\n\nAssistant answer:\n${output}\n\n` +
      'Score the answer and explain your reasoning briefly.',
    ),
  ]);

  const client = getLangfuseClient();
  if (client && traceId) {
    client.score.create({
      traceId,
      name: 'llm-judge',
      value: judgement.score,
      dataType: 'NUMERIC',
      comment: judgement.reasoning,
    });
    // Scores are batched; flush so the score shows up immediately.
    await client.score.flush();
  }

  return judgement;
}
