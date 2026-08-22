import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { z } from 'zod';

import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  trimMessages,
} from '@langchain/core/messages';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
  PromptTemplate,
} from '@langchain/core/prompts';
import {
  RunnableLambda,
  RunnablePassthrough,
  RunnableSequence,
} from '@langchain/core/runnables';
import { tool } from '@langchain/core/tools';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOpenAI } from '@langchain/openai';
import {
  Annotation,
  MemorySaver,
  MessagesAnnotation,
  StateGraph,
  START,
} from '@langchain/langgraph';

dotenv.config();

const app = express();
app.use(express.json());

/*
 * Shared pieces — one model, many demos.
 *
 * This app is a deliberately broad tour of the major LangChain concepts.
 * Each POST route below demonstrates exactly one idea so it can be used as a
 * reference for future projects. Routes are grouped by concept:
 *   0. /                         — index of all routes
 *   1. /messages                — message roles (System/Human/AI/Tool)
 *   2. /prompt                  — string PromptTemplate
 *   3. /chat-prompt             — ChatPromptTemplate + MessagesPlaceholder
 *   4. /structured              — withStructuredOutput (typed response)
 *   5. /chain                   — LCEL: .pipe() + RunnableSequence
 *   6. /lc                      — Runnable primitives (Passthrough/Lambda)
 *   7. /stream                  — streaming tokens
 *   8. /tools                   — tool calling (@tool + bindTools)
 *   9. /memory                  — LangGraph StateGraph + MemorySaver (state + history)
 */

// GPT-4o is a good default. `temperature: 0` is best for structured/tool tasks,
// higher values for chat — see llm-fundamentals.md §5.
const model = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o',
  temperature: 0.7,
});

// A deterministic model for structured output and tool calling, where the
// *shape* matters more than the wording.
const strictModel = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o',
  temperature: 0,
});

// ---------------------------------------------------------------------------
// 0. Index
// ---------------------------------------------------------------------------

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'langchain',
    description: 'LangChain concept demos — one route per concept.',
    routes: [
      '/messages',
      '/prompt',
      '/chat-prompt',
      '/structured',
      '/chain',
      '/lc',
      '/stream',
      '/tools',
      '/memory',
    ],
  });
});

// ---------------------------------------------------------------------------
// 1. Messages — roles and content
// ---------------------------------------------------------------------------

/*
 * Chat models read a list of typed messages. Roles are not cosmetic — the model
 * uses them to know who said what (see langchain-fundamentals.md §3).
 * `SystemMessage` sets instructions, Human is the user, AIMessage is a prior
 * model turn, ToolMessage carries a tool result back into the loop.
 */
app.post('/messages', async (req: Request, res: Response) => {
  const { message = 'Explain it briefly.' } = req.body;

  const messages = [
    new SystemMessage('You are a terse, confident senior engineer.'),
    new HumanMessage(message),
  ];

  const response = await model.invoke(messages);
  res.json({ roles: messages.map((m) => m.constructor.name), response: response.content });
});

// ---------------------------------------------------------------------------
// 2. PromptTemplate — string prompt with a variable
// ---------------------------------------------------------------------------

/*
 * The simplest prompt form: text with `{variable}` placeholders filled at
 * invoke time. Great for plain (non-chat) LLM calls or simple templates.
 */
app.post('/prompt', async (req: Request, res: Response) => {
  const { topic = 'vectors', audience = 'beginners' } = req.body;

  const prompt = PromptTemplate.fromTemplate(
    'Write a short intro to {topic} for {audience}. Keep it to three sentences.',
  );

  const chain = prompt.pipe(model).pipe(new StringOutputParser());
  const output = await chain.invoke({ topic, audience });

  res.json({ prompt: await prompt.format({ topic, audience }), output });
});

// ---------------------------------------------------------------------------
// 3. ChatPromptTemplate + MessagesPlaceholder — structured chat prompt
// ---------------------------------------------------------------------------

/*
 * For chat, ChatPromptTemplate builds role-tagged messages. The
 * MessagesPlaceholder is where a list of prior messages is injected — this is
 * the seam that turns a one-shot prompt into a multi-turn conversation.
 */
app.post('/chat-prompt', async (req: Request, res: Response) => {
  const { message = 'What is the difference between RAG and fine-tuning?', role = 'tutor' } =
    req.body;

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', 'You are a {role} who explains with an analogy.'],
    new MessagesPlaceholder('history'),
    ['user', '{message}'],
  ]);

  const chain = prompt.pipe(model).pipe(new StringOutputParser());
  const output = await chain.invoke({ role, message, history: [] });

  res.json({ output });
});

// ---------------------------------------------------------------------------
// 4. Structured output — enforce a JSON schema
// ---------------------------------------------------------------------------

/*
 * `withStructuredOutput` constrains the model to return a value matching a Zod
 * schema. Prefer this over "please return JSON" when a consumer is code — see
 * prompt-engineering.md §7.
 */
const schema = z.object({
  answer: z.string(),
  confidence: z.number(),
});

app.post('/structured', async (req: Request, res: Response) => {
  const { question = 'In one sentence, what is a vector database?' } = req.body;

  const structured = strictModel.withStructuredOutput(schema);
  const response = await structured.invoke(question);

  res.json(response);
});

// ---------------------------------------------------------------------------
// 5. LCEL — composing runnables with .pipe() and RunnableSequence
// ---------------------------------------------------------------------------

/*
 * The LangChain Expression Language: prompt → model → parser, composed.
 * `RunnableSequence.from` is the explicit form of the same chain, and lets you
 * shape inputs with plain functions even when the LLM isn't streaming.
 */
app.post('/chain', async (req: Request, res: Response) => {
  const { topic = 'MCP' } = req.body;

  const prompt = PromptTemplate.fromTemplate('Define {topic} in exactly one sentence.');
  const chain = RunnableSequence.from([prompt, model, new StringOutputParser()]);

  const output = await chain.invoke({ topic });

  res.json({ output });
});

// ---------------------------------------------------------------------------
// 6. Runnable primitives — passthrough and lambda
// ---------------------------------------------------------------------------

/*
 * Two handy composition primitives:
 * - RunnablePassthrough: pass a value through unchanged (and optionally add keys).
 * - RunnableLambda: wrap your own function as a runnable.
 * Together they let you branch/transform data inside a chain.
 */
app.post('/lc', async (req: Request, res: Response) => {
  const { word = 'synergy' } = req.body;

  const echoAndCount = RunnablePassthrough.assign({
    length: RunnableLambda.from((input: { word: string }) => input.word.length),
    upper: RunnableLambda.from((input: { word: string }) => input.word.toUpperCase()),
  });

  const result = await echoAndCount.invoke({ word });
  res.json(result);
});

// ---------------------------------------------------------------------------
// 7. Streaming — consume tokens as they're generated
// ---------------------------------------------------------------------------

/*
 * `.stream()` yields tokens as they arrive instead of waiting for the full
 * answer. Latency is dominated by output tokens, so this is how you make a
 * user-visible response feel fast. The chain is the same — only consumption
 * changes.
 */
app.post('/stream', async (req: Request, res: Response) => {
  const { message = 'Count from 1 to 5, one number per line.' } = req.body;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.flushHeaders();

  const prompt = PromptTemplate.fromTemplate('{message}');
  const chain = prompt.pipe(strictModel).pipe(new StringOutputParser());

  for await (const chunk of await chain.stream({ message })) {
    res.write(chunk);
  }
  res.end();
});

// ---------------------------------------------------------------------------
// 8. Tool calling — let the model invoke functions
// ---------------------------------------------------------------------------

/*
 * Tools are functions with a description + Zod schema. The model decides when
 * to call one and fills the args from natural language — the description is the
 * model's only guide (see ai-agents.md §3–5). Tools must be *handled*: we loop
 * and feed each ToolMessage back to the model, since it re-decides after seeing
 * the result.
 */
const multiplyTool = tool(
  async ({ a, b }: { a: number; b: number }) => String(a * b),
  {
    name: 'multiply',
    description: 'Multiply two numbers. Call this when the user asks for a product.',
    schema: z.object({ a: z.number(), b: z.number() }),
  },
);

const addTool = tool(
  async ({ a, b }: { a: number; b: number }) => String(a + b),
  {
    name: 'add',
    description: 'Add two numbers. Call this when the user asks for a sum.',
    schema: z.object({ a: z.number(), b: z.number() }),
  },
);

const tools = [multiplyTool, addTool];

app.post('/tools', async (req: Request, res: Response) => {
  const { message = 'What is 7 times 8?' } = req.body;

  // bindTools advertises the tools to the model so it may call them.
  const toolModel = strictModel.bindTools(tools);

  let messages: (HumanMessage | AIMessage | ToolMessage)[] = [new HumanMessage(message)];

  // Run up to 10 model steps. The model calls tools until it produces a final
  // answer with no tool_requests.
  for (let i = 0; i < 10; i++) {
    const aiMessage = await toolModel.invoke(messages);

    messages.push(aiMessage);

    // No tool calls → the model is done; return the final text.
    if (!aiMessage.tool_calls?.length) {
      return res.json({
        messages: messages.length,
        steps: i + 1,
        answer: aiMessage.content,
      });
    }

    // Execute each requested tool and feed the ToolMessage back.
    for (const call of aiMessage.tool_calls) {
      const found = tools.find((t) => t.name === call.name);
      let result = 'unknown tool';
      if (found) {
        result = await found.invoke(call.args as { a: number; b: number });
      }
      messages.push(new ToolMessage({ tool_call_id: call.id ?? 'tool', content: result }));
    }
  }

  res.status(400).json({ error: 'Tool loop exceeded max steps' });
});

// ---------------------------------------------------------------------------
// 9. Memory — LangGraph StateGraph + MemorySaver
// ---------------------------------------------------------------------------

/*
 * The modern replacement for the deprecated RunnableWithMessageHistory is a
 * LangGraph StateGraph with a checkpointer. State (here: the message list plus
 * custom fields) is persisted keyed by `thread_id`, so conversation survives
 * across requests — and across the `skill`/`message` inputs.
 */

// The graph node function: receives state, returns a partial state update.
const callModel = async (state: {
  messages: unknown[];
  skill: string;
  message: string;
}) => {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', 'You are an assistant who is good at {skill}.'],
    new MessagesPlaceholder('history'),
    ['user', '{message}'],
  ]);

  const chain = prompt.pipe(model);
  const response = await chain.invoke({
    skill: state.skill,
    message: state.message,
    history: state.messages,
  });

  return {
    messages: [
      new HumanMessage(state.message),
      new AIMessage(String(response.content)),
    ],
    lastResponse: response.content,
  };
};

// Extend the standard messages list with custom fields: skill and message (in),
// lastResponse (out).
const graphState = Annotation.Root({
  ...MessagesAnnotation.spec,
  skill: Annotation<string>(),
  message: Annotation<string>(),
  lastResponse: Annotation<string | undefined>(),
});

const workflow = new StateGraph(graphState)
  .addNode('model', callModel)
  .addEdge(START, 'model');

// In-memory checkpointer. Swap for SqliteSaver/PostgresSaver for durability —
// this is the only reason history resets on restart.
const memory = new MemorySaver();
const memoryGraph = workflow.compile({ checkpointer: memory });

app.post('/memory', async (req: Request, res: Response) => {
  const { message, skill = 'nodejs', thread_id = 'assistant' } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const aiResponse = await memoryGraph.invoke(
      { skill, message },
      { configurable: { thread_id } },
    );

    res.json({ response: aiResponse.lastResponse });
  } catch (error) {
    res.status(500).json({ error: 'AI service error', details: error });
  }
});

// ---------------------------------------------------------------------------
// 9b. History bounds — trim a growing message list
// ---------------------------------------------------------------------------

/*
 * Long conversations overflow the context window. `trimMessages` keeps only the
 * most recent tokens (with a budget for the system prompt and the latest turn).
 */
app.post('/trim', async (req: Request, res: Response) => {
  const { history = [] } = req.body;

  const messages = [
    new SystemMessage('You are a helpful assistant.'),
    ...(history as { role: string; content: string }[]).map((m) =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
    ),
  ];

  const tokenCounter = (msgs: BaseMessage[]) =>
    Math.ceil(
      msgs.reduce((sum, msg) => sum + String(msg.content).length, 0) / 4,
    );

  const trimmed = await trimMessages(messages, {
    maxTokens: 40,
    strategy: 'last',
    tokenCounter,
    includeSystem: true,
    startOn: 'human',
    allowPartial: true,
  });

  res.json({ original: messages.length, remaining: trimmed.length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LangChain concept demos listening on port ${PORT}`);
});
