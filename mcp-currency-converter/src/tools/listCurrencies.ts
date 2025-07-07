/**
 * List avaible currencies tool. Available currencies are fetched from freecurrencyapi.com
 */
import { z } from 'zod';
import { MCPTool } from '../types';

// Schema
const schema = z.object({});

// List currencies tool
export const listCurrenciesTool: MCPTool<typeof schema> = {
  name: 'list-currencies',
  description: 'Lists all supported currencies',
  schema,
  handler: async () => {
    const currencyFinderKey = process.env.FREE_CURRENCY_KEY;
    if (!currencyFinderKey) throw new Error('Missing FREE_CURRENCY_KEY');

    console.log('Listing supported currencies');

    const response = await fetch(
      `https://api.freecurrencyapi.com/v1/currencies?apikey=${currencyFinderKey}`
    );
    const data = await response.json();

    return {
      content: [
        {
          type: 'text',
          text: `Supported currencies: ${Object.keys(data).join(', ')}`,
        },
      ],
    };
  }
};
