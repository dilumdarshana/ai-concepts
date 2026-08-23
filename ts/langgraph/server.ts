import dotenv from 'dotenv';

// Load env vars BEFORE local imports so Prisma gets DATABASE_URL.
dotenv.config();

import express, { Request, Response } from 'express';
import { z } from 'zod';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import {
  Annotation,
  Command,
  END,
  MemorySaver,
  MessagesAnnotation,
  START,
  StateGraph,
  interrupt,
} from '@langchain/langgraph';
import { getAgent } from './agent';

const app = express();
app.use(express.json());

/*
 * Shared pieces — one model, many demos.
 *
 * This app is a deliberately broad tour of the major LangGraph concepts.
 * Each POST route below demonstrates exactly one idea so it can be used as a
 * reference for future projects. The "graph mechanics" routes (/graph,
 * /reducers, /conditional, /parallel, /subgraph, /supervisor, /interrupt,
 * /time-travel) are pure TypeScript and run with no API keys — they show how
 * the graph runtime itself behaves. The "model" routes (/memory, /stream,
 * /agent, /structured) need OPENAI_API_KEY.
 *
 * Routes are grouped by concept:
 *   0.  /           — index of all routes
 *   1.  /graph      — StateGraph: nodes, edges, state, compile, invoke
 *   2.  /reducers   — state channels: replace vs accumulate (custom reducers)
 *   3.  /conditional — conditional edges: the graph decides the next node
 *   4.  /parallel   — fan-out / fan-in: parallel nodes + reducer join (barrier)
 *   5.  /memory     — MessagesAnnotation + MemorySaver + thread_id (memory)
 *   6.  /agent      — createAgent (langchain): prebuilt ReAct agent + tools + MCP
 *   7.  /stream     — streaming: consume tokens / node updates as they arrive
 *   8.  /interrupt  — human-in-the-loop: interrupt() then resume with Command
 *   9.  /subgraph   — a compiled graph used as a node inside another graph
 *   10. /supervisor — multi-agent: a supervisor routes to sub-agents
 *   11. /time-travel — replay & fork: getStateHistory + updateState
 *   12. /structured — withStructuredOutput producing typed state in a node
 */

// Chat/demo model for conversational routes. gpt-4o-mini is cheap and fast.
const model = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-mini',
  temperature: 0.7,
});

// A deterministic model for structured output and the agent, where the *shape*
// matters more than the wording.
const strictModel = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-mini',
  temperature: 0,
});

// ---------------------------------------------------------------------------
// 0. Index
// ---------------------------------------------------------------------------

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'langgraph',
    description: 'LangGraph concept demos — one route per concept.',
    routes: [
      '/graph',
      '/reducers',
      '/conditional',
      '/parallel',
      '/memory',
      '/agent',
      '/stream',
      '/interrupt',
      '/subgraph',
      '/supervisor',
      '/time-travel',
      '/structured',
    ],
  });
});

// ---------------------------------------------------------------------------
// 1. StateGraph — nodes, edges, state, compile, invoke
// ---------------------------------------------------------------------------

/*
 * The core primitive. You declare a *state shape* (a set of channels), then a
 * *graph of nodes* (functions that read and write that state) connected by
 * *edges* (who runs after whom). Compile it, invoke it. State flows in, is
 * transformed node by node, flows out. This is deliberately a plain function
 * pipeline — no LLM — so you can see the runtime clearly.
 *
 * Notice: no loop, no branching, just START → A → B → END. This is already a
 * graph; conditional edges (§3) add the branching, cycles add the loops.
 */

interface BasicState {
  value: number;
  step: string;
}

const basicState = Annotation.Root({
  value: Annotation<number>(),
  step: Annotation<string>(),
});

const increment = async (state: BasicState) => ({
  value: state.value + 1,
  step: 'increment',
});

const double = async (state: BasicState) => ({
  value: state.value * 2,
  step: 'double',
});

const basicGraph = new StateGraph(basicState)
  .addNode('increment', increment)
  .addNode('double', double)
  .addEdge(START, 'increment')
  .addEdge('increment', 'double')
  .addEdge('double', END)
  .compile();

app.post('/graph', async (req: Request, res: Response) => {
  const { value = 5 } = req.body;
  const result = await basicGraph.invoke({ value });
  res.json(result);
});

// ---------------------------------------------------------------------------
// 2. State reducers — replace vs accumulate
// ---------------------------------------------------------------------------

/*
 * Each field in the state is a *channel* with a reducer that decides how writes
 * combine. The default reducer is "last write wins" (replace). You override it
 * to *accumulate*: the reducer receives (current, update) and returns the new
 * channel value.
 *
 * This is what makes stateful graphs possible:
 *   - last (default)  → overwritten each step   => final 'step' is the last node
 *   - items (concat)  → grows across steps      => both nodes contribute
 *   - total (sum)     → accumulates across steps => 2 + 3 = 5
 *
 * The same mechanism, applied to the `messages` channel with the `addMessages`
 * reducer, is what lets a graph remember a conversation (see §5).
 */

interface ReducerState {
  last: string;
  items: string[];
  total: number;
}

const reducerState = Annotation.Root({
  last: Annotation<string>(),
  items: Annotation<string[]>({
    reducer: (current: string[], update: string[]) => current.concat(update),
    default: () => [],
  }),
  total: Annotation<number>({
    reducer: (current: number, update: number) => current + update,
    default: () => 0,
  }),
});

const firstNode = async () => ({ last: 'first', items: ['first'], total: 2 });
const secondNode = async () => ({
  last: 'second',
  items: ['second'],
  total: 3,
});

const reducerGraph = new StateGraph(reducerState)
  .addNode('first', firstNode)
  .addNode('second', secondNode)
  .addEdge(START, 'first')
  .addEdge('first', 'second')
  .addEdge('second', END)
  .compile();

app.post('/reducers', async (_req: Request, res: Response) => {
  const result = await reducerGraph.invoke({});
  res.json(result);
});

// ---------------------------------------------------------------------------
// 3. Conditional edges — the graph decides the next node
// ---------------------------------------------------------------------------

/*
 * `addConditionalEdges` attaches a *router* to a node. Instead of a fixed next
 * node, the router reads state and returns the name of the next node (or an
 * array for parallel fan-out, see §4). The third argument maps the router's
 * return value to an actual node name. This is how a graph "decides" its own
 * path — the difference between a straight chain and real orchestration.
 */

interface ConditionalState {
  topic: string;
  route: string;
  answer: string;
}

const conditionalState = Annotation.Root({
  topic: Annotation<string>(),
  route: Annotation<string>(),
  answer: Annotation<string>(),
});

const classifyTopic = async (state: ConditionalState) => ({
  route: state.topic.toLowerCase().includes('history') ? 'history' : 'tech',
});

const techAgent = async () => ({
  answer: 'Looks like a tech topic (route -> tech)',
});
const historyAgent = async () => ({
  answer: 'Looks like a history topic (route -> history)',
});

const conditionalGraph = new StateGraph(conditionalState)
  .addNode('classify', classifyTopic)
  .addNode('tech', techAgent)
  .addNode('history', historyAgent)
  .addEdge(START, 'classify')
  .addConditionalEdges('classify', (state: ConditionalState) => state.route, {
    tech: 'tech',
    history: 'history',
  } as const)
  .addEdge('tech', END)
  .addEdge('history', END)
  .compile();

app.post('/conditional', async (req: Request, res: Response) => {
  const { topic = 'The invention of the wheel' } = req.body;
  const result = await conditionalGraph.invoke({ topic });
  res.json(result);
});

// ---------------------------------------------------------------------------
// 4. Parallel — fan-out, reducer join, barrier
// ---------------------------------------------------------------------------

/*
 * Two START edges mean `left` and `right` run *in parallel*. Both write to the
 * same `results` channel, and the `items`-style reducer merges their writes.
 * `aggregate` only runs once *both* are done (both edges point to it) — that
 * inn is a barrier. This is the "wait for all branches, then combine" pattern
 * used for map-reduce and parallel tool calls.
 */

interface ParallelState {
  results: string[];
  summary: string;
}

const parallelState = Annotation.Root({
  results: Annotation<string[]>({
    reducer: (current: string[], update: string[]) => current.concat(update),
    default: () => [],
  }),
  summary: Annotation<string>(),
});

const leftNode = async () => ({ results: ['left'] });
const rightNode = async () => ({ results: ['right'] });

// A barrier node: it only runs after *both* branches finish (both edges point
// here), and it summarizes the merged `results` without re-writing them.
const aggregateNode = async (state: ParallelState) => ({
  summary: state.results.join(' + '),
});

const parallelGraph = new StateGraph(parallelState)
  .addNode('left', leftNode)
  .addNode('right', rightNode)
  .addNode('aggregate', aggregateNode)
  .addEdge(START, 'left')
  .addEdge(START, 'right')
  .addEdge('left', 'aggregate')
  .addEdge('right', 'aggregate')
  .addEdge('aggregate', END)
  .compile();

app.post('/parallel', async (_req: Request, res: Response) => {
  const result = await parallelGraph.invoke({});
  res.json(result);
});

// ---------------------------------------------------------------------------
// 5. Memory — messages state + checkpointer + thread_id
// ---------------------------------------------------------------------------

/*
 * By default a graph invocation is stateless. Atop `MessagesAnnotation` (which
 * gives a `messages` channel that *appends* via the addMessages reducer) we
 * compile the graph *with a checkpointer*. The checkpointer snapshots state
 * keyed by a `thread_id` in the configurable options. Two requests with the
 * same `thread_id` share history; different ids are independent sessions.
 *
 * MemorySaver is in-process only — history resets when the server restarts.
 * Swap it for SqliteSaver/PostgresSaver for durable memory.
 */

const memory = new MemorySaver();

const memoryCallModel = async (state: { messages: BaseMessage[] }) => {
  const response = await model.invoke(state.messages);
  return { messages: [response] as BaseMessage[] };
};

const memoryGraph = new StateGraph(MessagesAnnotation)
  .addNode('model', memoryCallModel)
  .addEdge(START, 'model')
  .addEdge('model', END)
  .compile({ checkpointer: memory });

app.post('/memory', async (req: Request, res: Response) => {
  const {
    message,
    thread_id = 'assistant',
    skill = 'a helpful assistant',
  } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const config = { configurable: { thread_id } };

  // The checkpointer already holds prior turns for this thread, so we only pass
  // the *new* turn (plus a one-time system prompt). The addMessages reducer on
  // the `messages` channel appends it to history. That's the whole trick: state
  // in, checkpoint out, and it's remembered next time with the same thread_id.
  const prior = (await memoryGraph.getState(config)).values?.messages ?? [];
  const input = [
    ...(prior.length
      ? []
      : [new SystemMessage(`You are ${skill}. Answer briefly.`)]),
    new HumanMessage(message),
  ];

  const result = await memoryGraph.invoke({ messages: input }, config);

  res.json({
    thread_id,
    response: String(result.messages.at(-1)?.content ?? ''),
    totalMessages: result.messages.length,
  });
});

// ---------------------------------------------------------------------------
// 6. Agent — createAgent (prebuilt ReAct, from the langchain package)
// ---------------------------------------------------------------------------

/*
 * The prebuilt `createAgent` (from the `langchain` package — the non-deprecated
 * successor of `createReactAgent`) hides the whole ReAct loop (think → act →
 * observe → repeat) behind one call. Give it a model plus a list of tools, and
 * it runs the loop for you: the model picks a tool, your code runs it, the
 * ToolMessage is fed back, and the model re-decides until it answers.
 *
 * The tool set here is defined in agent.ts: two local tools (currency
 * conversion, database introspection/query) plus whatever the GitHub MCP
 * server advertises — all merged into one agent.
 */

app.post('/agent', async (req: Request, res: Response) => {
  const { message } = req.body;
  try {
    const agent = await getAgent();
    const result = await agent.invoke({
      messages: [new HumanMessage(message)],
    });
    res.json({
      response: String(result.messages.at(-1)?.content ?? ''),
      steps: result.messages.length - 1,
    });
  } catch (error) {
    console.error('Error on agent', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// 7. Streaming — consume tokens as they're generated
// ---------------------------------------------------------------------------

/*
 * `.stream()` (or `.astream()`) yields values as the graph produces them instead
 * of waiting for the final state. With `streamMode: 'messages'` you get the
 * model's token chunks as they arrive — the mode that makes a response feel
 * instant. The graph is identical; only consumption changes.
 */

const streamGraph = new StateGraph(MessagesAnnotation)
  .addNode('model', memoryCallModel)
  .addEdge(START, 'model')
  .addEdge('model', END)
  .compile({ checkpointer: new MemorySaver() });

app.post('/stream', async (req: Request, res: Response) => {
  const { message = 'Count from 1 to 5, one number per line.' } = req.body;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.flushHeaders();

  const run = await streamGraph.stream(
    { messages: [new HumanMessage(message)] },
    { streamMode: 'messages', configurable: { thread_id: 'stream' } },
  );

  for await (const event of run) {
    // In 'messages' mode each event is either [chunk, metadata] or { message, metadata }.
    const chunk = Array.isArray(event)
      ? event[0]
      : (event as { message?: BaseMessage }).message;
    const text = chunk?.content;
    if (typeof text === 'string' && text.length > 0) {
      res.write(text);
    }
  }
  res.end();
});

// ---------------------------------------------------------------------------
// 8. Interrupt & resume — human-in-the-loop
// ---------------------------------------------------------------------------

/*
 * `interrupt()` suspends the graph *mid-run* and returns control to the caller.
 * Nothing is lost — the state (and a checkpointer, below) is kept. A human then
 * sends a `Command({ resume })` and the graph picks up exactly where it left
 * off, with the resume value handed back to the `interrupt()` call.
 *
 * This is the mechanism behind "approval steps" and any long-running job that
 * needs a human decision between nodes.
 */

interface ReviewState {
  request: string;
  approved: boolean;
  result: string;
}

const reviewState = Annotation.Root({
  request: Annotation<string>(),
  approved: Annotation<boolean>(),
  result: Annotation<string>(),
});

const reviewNode = async (state: ReviewState) => {
  // Suspend; the value is shown to whoever controls the run.
  const decision = interrupt<{ message: string }, { approved: boolean }>({
    message: `Approve the request "${state.request}"?`,
  });
  return {
    approved: decision.approved,
    result: decision.approved
      ? `Executed: ${state.request}`
      : `Rejected: ${state.request}`,
  };
};

const finaliseNode = async (state: ReviewState) => ({
  result: `FINAL -> ${state.result}`,
});

const hitlGraph = new StateGraph(reviewState)
  .addNode('review', reviewNode)
  .addNode('finalise', finaliseNode)
  .addEdge(START, 'review')
  .addEdge('review', 'finalise')
  .addEdge('finalise', END)
  .compile({ checkpointer: new MemorySaver() });

app.post('/interrupt', async (req: Request, res: Response) => {
  const { request = 'Refund $50' } = req.body;
  // A fresh thread each call so the demo always starts from a clean suspend.
  const thread_id = `hitl-${Date.now()}`;
  const config = { configurable: { thread_id } };

  // First call: the graph runs until it hits interrupt() and suspends.
  const suspended = await hitlGraph.invoke({ request }, config);

  const interrupts = (suspended as Record<string, unknown>)['__interrupt__'] as
    Array<{ value?: { message?: string } }> | undefined;

  res.json({
    status: 'awaiting_approval',
    thread_id,
    interrupt: interrupts?.[0]?.value ?? null,
    resume: `POST /interrupt/resume with { "thread_id": "${thread_id}", "approve": true | false }`,
  });
});

app.post('/interrupt/resume', async (req: Request, res: Response) => {
  const { thread_id, approve = true } = req.body;
  if (!thread_id) {
    return res.status(400).json({ error: 'thread_id is required' });
  }
  const config = { configurable: { thread_id } };

  // Resume with the value interrupt() should receive.
  const result = await hitlGraph.invoke(
    new Command({ resume: { approved: approve } }),
    config,
  );

  res.json({ status: 'completed', thread_id, approved: approve, result });
});

// ---------------------------------------------------------------------------
// 9. Subgraph — a compiled graph used as a node
// ---------------------------------------------------------------------------

/*
 * A compiled graph is itself a runnable, so it can be dropped into another
 * graph as a node. This is composition: build small, testable graphs and
 * compose them into larger ones. The inner graph receives the shared state,
 * does its work, and writes back to the same channels.
 */

const squareSubgraph = new StateGraph(
  Annotation.Root({
    value: Annotation<number>(),
    squared: Annotation<number>(),
  }),
)
  .addNode('square', async (state: { value: number }) => ({
    squared: state.value ** 2,
  }))
  .addEdge(START, 'square')
  .addEdge('square', END)
  .compile();

const outerGraph = new StateGraph(
  Annotation.Root({
    value: Annotation<number>(),
    squared: Annotation<number>(),
    result: Annotation<string>(),
  }),
)
  .addNode('math', squareSubgraph) // the subgraph, used as a node
  .addNode('describe', async (state: { value: number; squared: number }) => ({
    result: `${state.value} squared is ${state.squared}`,
  }))
  .addEdge(START, 'math')
  .addEdge('math', 'describe')
  .addEdge('describe', END)
  .compile();

app.post('/subgraph', async (req: Request, res: Response) => {
  const { value = 7 } = req.body;
  const result = await outerGraph.invoke({ value });
  res.json(result);
});

// ---------------------------------------------------------------------------
// 10. Supervisor — multi-agent orchestration
// ---------------------------------------------------------------------------

/*
 * The supervisor pattern: one "supervisor" agent decides *which* specialist
 * sub-agent should handle the request, routes to it, and lets it answer. Here
 * the routing is a plain function (delegate by keyword); with an LLM supervisor
 * the routing becomes a tool call on a set of "sub-agent as tool" runnables.
 * The point is the same: a router decomposes a request and picks a specialist.
 */

interface SupervisorState {
  task: string;
  agent: string;
  report: string;
}

const supervisorState = Annotation.Root({
  task: Annotation<string>(),
  agent: Annotation<string>(),
  report: Annotation<string>(),
});

const supervisorNode = async (state: SupervisorState) => {
  const task = state.task.toLowerCase();
  const isCurrency = [
    'currency',
    'convert',
    'usd',
    'eur',
    'exchange',
    'gbp',
  ].some((k) => task.includes(k));
  const isDatabase = ['db', 'database', 'table', 'sql', 'query'].some((k) =>
    task.includes(k),
  );
  return {
    agent: isCurrency ? 'currency' : isDatabase ? 'database' : 'general',
  };
};

const currencyAgentNode = async (state: SupervisorState) => ({
  report: `[currency] handled "${state.task}"`,
});
const databaseAgentNode = async (state: SupervisorState) => ({
  report: `[database] handled "${state.task}"`,
});
const generalAgentNode = async (state: SupervisorState) => ({
  report: `[general] handled "${state.task}"`,
});

const supervisorGraph = new StateGraph(supervisorState)
  .addNode('supervisor', supervisorNode)
  .addNode('currencyAgent', currencyAgentNode)
  .addNode('databaseAgent', databaseAgentNode)
  .addNode('generalAgent', generalAgentNode)
  .addEdge(START, 'supervisor')
  .addConditionalEdges('supervisor', (state: SupervisorState) => state.agent, {
    currency: 'currencyAgent',
    database: 'databaseAgent',
    general: 'generalAgent',
  } as const)
  .addEdge('currencyAgent', END)
  .addEdge('databaseAgent', END)
  .addEdge('generalAgent', END)
  .compile();

app.post('/supervisor', async (req: Request, res: Response) => {
  const { task = 'convert 100 USD to EUR' } = req.body;
  const result = await supervisorGraph.invoke({ task });
  res.json({ agent: result.agent, report: result.report });
});

// ---------------------------------------------------------------------------
// 11. Time travel — replay & fork
// ---------------------------------------------------------------------------

/*
 * With a checkpointer, every superstep is saved as a checkpoint. That gives you
 * two superpowers:
 *   - `getStateHistory(config)` — walk back through every past state (replay).
 *   - `updateState(config, values)` — write a checkpoint as if a node had run,
 *     then invoke from there (fork). You can branch from any historical point.
 *
 * This is the basis of debugging, "undo", and replaying a run.
 */

interface TravelState {
  count: number;
  note: string;
}

const travelState = Annotation.Root({
  count: Annotation<number>(),
  note: Annotation<string>(),
});

const stepNode = async (state: TravelState) => ({
  count: (state.count ?? 0) + 1,
  note: `step ${(state.count ?? 0) + 1}`,
});

const travelGraph = new StateGraph(travelState)
  .addNode('step', stepNode)
  .addEdge(START, 'step')
  .addEdge('step', END)
  .compile({ checkpointer: new MemorySaver() });

app.post('/time-travel', async (req: Request, res: Response) => {
  const { thread_id = 'tt', steps = 3, fork = false } = req.body;
  const config = { configurable: { thread_id } };

  // Run N checkpoints by invoking the same graph repeatedly.
  for (let i = 0; i < steps; i++) {
    await travelGraph.invoke({}, config);
  }

  // Replay: walk the history, collapsing duplicate checkpoints into the unique
  // states so the progression is easy to read.
  const seen = new Set<string>();
  const history: Array<{ count: number; note: string }> = [];
  for await (const snapshot of travelGraph.getStateHistory(config)) {
    const values = snapshot.values as { count?: number; note?: string };
    const key = `${values.count ?? 0}|${values.note ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    history.push({ count: values.count ?? 0, note: values.note ?? '' });
  }

  let forked: { count: number; note: string } | null = null;
  if (fork) {
    // Fork from the current checkpoint by writing new state, then invoke.
    await travelGraph.updateState(config, { note: 'FORKED' });
    const result = await travelGraph.invoke({}, config);
    forked = { count: result.count ?? 0, note: result.note ?? '' };
  }

  res.json({
    history, // newest first, so history[0] is the latest checkpoint
    total: history.length,
    forked,
  });
});

// ---------------------------------------------------------------------------
// 12. Structured output — typed state from a node
// ---------------------------------------------------------------------------

/*
 * When a node must return machine-readable data, wrap the model with
 * `withStructuredOutput(schema)`. The model uses its tool-calling machinery to
 * emit a value matching the Zap schema, so the node's output shape is
 * guaranteed. The graph then carries that typed object through state.
 */

const analysisSchema = z.object({
  summary: z.string(),
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  keywords: z.array(z.string()),
});

const structuredModel = strictModel.withStructuredOutput(analysisSchema);

const structuredState = Annotation.Root({
  text: Annotation<string>(),
  analysis: Annotation<z.infer<typeof analysisSchema>>(),
});

const analyseNode = async (state: { text: string }) => ({
  analysis: await structuredModel.invoke(state.text),
});

const structuredGraph = new StateGraph(structuredState)
  .addNode('analyse', analyseNode)
  .addEdge(START, 'analyse')
  .addEdge('analyse', END)
  .compile();

app.post('/structured', async (req: Request, res: Response) => {
  const {
    text = 'The graph API is elegant and fast, but the docs are sparse.',
  } = req.body;
  const result = await structuredGraph.invoke({ text });
  res.json(result.analysis);
});

// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LangGraph concept demos listening on port ${PORT}`);
});
