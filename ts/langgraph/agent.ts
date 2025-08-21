import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { convertCurrency } from './tools/currencyTool';
import { getUserByName, getAllUsers } from './tools/postgressTool';

const model = new ChatOpenAI({
  model: 'gpt-4o-mini',
});

export const agent = createReactAgent({
  llm: model,
  tools: [
    convertCurrency,
    getUserByName,
    getAllUsers,
  ],
});
