import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { Annotation, MemorySaver, MessagesAnnotation, StateGraph, START } from '@langchain/langgraph';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  answer: z.string(),
  confidence: z.number(),
});

const app = express();
app.use(express.json());

/*
 * LangChain v2.0 migration note:
 *
 * OLD approach (RunnableWithMessageHistory — deprecated):
 *   const chainWithHistory = new RunnableWithMessageHistory({
 *     runnable: chain,
 *     getMessageHistory: (sessionId) => { ... },
 *     inputMessagesKey: 'message',
 *     historyMessagesKey: 'history',
 *     outputMessagesKey: 'answer',
 *   });
 *
 * NEW approach (LangGraph StateGraph + MemorySaver checkpointer):
 *   - StateGraph manages conversational state (messages + custom fields)
 *   - MemorySaver persists state between invocations, keyed by thread_id
 *   - thread_id replaces sessionId from the old approach
 */
const model = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o',
  temperature: 0.7,
}).withStructuredOutput(schema);

const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are an assistant who good at {skill}'],
  new MessagesPlaceholder('history'),
  ['user', '{message}'],
]);

/*
 * Graph node function.
 * Receives state (injected by LangGraph) containing messages, skill, and message.
 * Returns partial state update — LangGraph merges this with existing state and
 * persists via the checkpointer.
 */
const callModel = async (state: typeof MessagesAnnotation.State & { skill: string; message: string }) => {
  const chain = prompt.pipe(model);
  const response = await chain.invoke({
    skill: state.skill,
    message: state.message,
    history: state.messages,
  });

  return {
    messages: [
      new HumanMessage(state.message),
      new AIMessage(JSON.stringify(response)),
    ],
    lastResponse: response,
  };
};

/*
 * Define the graph's state schema.
 * MessagesAnnotation provides the standard `messages: BaseMessage[]` field.
 * We extend it with custom fields: skill, message (input), and lastResponse (structured output).
 */
const graphState = Annotation.Root({
  ...MessagesAnnotation.spec,
  skill: Annotation<string>(),
  message: Annotation<string>(),
  lastResponse: Annotation<z.infer<typeof schema> | undefined>(),
});

const workflow = new StateGraph(graphState)
  .addNode('model', callModel)
  .addEdge(START, 'model');

// In-memory checkpointer — persists state keyed by thread_id across invocations.
// For production, swap MemorySaver for SqliteSaver, PostgresSaver, etc.
const memory = new MemorySaver();
const appGraph = workflow.compile({ checkpointer: memory });

app.post('/chat', async (req: Request, res: Response): Promise<any> => {
  const { message, skill = 'nodejs' } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const aiResponse = await appGraph.invoke(
      {
        skill,
        message,
      },
      {
        configurable: {
          thread_id: 'assistant',
        },
      },
    );

    res.json({ response: aiResponse.lastResponse });
  } catch (error) {
    res.status(500).json({ error: 'AI service error', details: error });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI chat backend running on port ${PORT}`);
});
