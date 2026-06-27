import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { convertCurrency } from './tools/currencyTool';
import { getDatabaseSchema, queryDatabase } from './tools/databaseTool';

// GPT-4o-mini powers the agent — decides which tool to invoke based
// on the user's natural-language request.
const model = new ChatOpenAI({
  model: 'gpt-4o-mini',
});

// createReactAgent wires the LLM plus available tools into a
// ReAct-loop agent (thought → action → observation → repeat).
export const agent = createReactAgent({
  llm: model,
  tools: [convertCurrency, getDatabaseSchema, queryDatabase],
});
