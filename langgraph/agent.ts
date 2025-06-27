import { tool } from '@langchain/core/tools';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { convertCurrency } from './tools/currencyTool';

const model = new ChatOpenAI({
  model: 'gpt-4o-mini',
});

export const agent = createReactAgent({
  llm: model,
  tools: [
    convertCurrency,
  ],
});
