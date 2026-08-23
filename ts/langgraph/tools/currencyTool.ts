import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// Define the expected input shape using Zod — the LLM fills these from
// the user's natural language (e.g., "100 USD to EUR").
const currencySchema = z.object({
  fromCurrency: z
    .string()
    .describe('The currency to convert from (e.g., USD, EUR)'),
  toCurrency: z
    .string()
    .describe('The currency to convert to (e.g., USD, EUR)'),
  amount: z.number().positive().describe('The amount to convert'),
});

type CurrencyInput = z.infer<typeof currencySchema>;

const toolFunction = async ({
  fromCurrency,
  toCurrency,
  amount,
}: CurrencyInput) => {
  const apiKey = process.env.FREE_CURRENCY_KEY;
  if (!apiKey) {
    return 'FREE_CURRENCY_KEY is not set — cannot convert currency';
  }

  console.log('Start calling convertCurrency tool...');

  // Free Currency API — returns real-time exchange rates.
  const response = await fetch(
    `https://api.freecurrencyapi.com/v1/latest?apikey=${apiKey}&base_currency=${fromCurrency}&currencies=${toCurrency}`,
  );
  const data = await response.json();

  const exchangeRate = data.data?.[toCurrency];
  if (typeof exchangeRate !== 'number') {
    return `Could not find an exchange rate for ${fromCurrency} -> ${toCurrency}`;
  }

  return {
    fromCurrency,
    toCurrency,
    amount,
    convertedAmount: exchangeRate * amount,
    exchangeRate,
  };
};

// Register as a LangChain tool so the agent discovers it automatically.
export const convertCurrency = tool(toolFunction, {
  name: 'convertCurrency',
  description: 'Convert currency to another currency',
  schema: currencySchema as any,
});
