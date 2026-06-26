import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { convertCurrency } from './tools/currencyTool';
import { getDatabaseSchema, queryDatabase } from './tools/databaseTool';

const model = new ChatOpenAI({
  model: 'gpt-4o-mini',
});

export const agent = createReactAgent({
  llm: model,
  tools: [convertCurrency, getDatabaseSchema, queryDatabase],
});
