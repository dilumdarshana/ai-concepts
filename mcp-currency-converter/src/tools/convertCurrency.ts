
/**
 * Convert given amount from one currency to another using the Free Currency API.
 */
import { z } from 'zod';
import { MCPTool } from '../types';

const schema = z.object({
  fromCurrency: z.string().describe('The currency to convert from (e.g., USD, EUR)'),
  toCurrency: z.string().describe('The currency to convert to (e.g., USD, EUR)'),
  amount: z.number().positive().describe('The amount to convert'),
});

export const convertCurrencyTool: MCPTool<typeof schema> = {
  name: 'convert-currency',
  description: 'Converts an amount from one currency to another',
  schema,
  handler: async ({ fromCurrency, toCurrency, amount }: any) => {
    const currencyFinderKey = process.env.FREE_CURRENCY_KEY;
    if (!currencyFinderKey) throw new Error('Missing FREE_CURRENCY_KEY');

    console.log(`Converting ${amount} ${fromCurrency} to ${toCurrency}`);

    const response = await fetch(
      `https://api.freecurrencyapi.com/v1/latest?apikey=${currencyFinderKey}&base_currency=${fromCurrency}&currencies=${toCurrency}`
    );

    const data = await response.json();
    const exchangeRate = data.data?.[toCurrency];

    if (!exchangeRate) throw new Error('Invalid exchange rate');

    const convertedAmount = exchangeRate * amount;

    return {
      content: [
        {
          type: 'text',
          text: `Converted ${amount} ${fromCurrency} to ${toCurrency}: ${convertedAmount} ${toCurrency}`,
        },
      ],
    };
  }
};
