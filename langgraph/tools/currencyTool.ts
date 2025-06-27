import { tool } from '@langchain/core/tools';
import { z } from 'zod';

type ToolParams = {
  fromCurrency: string;
  toCurrency: string;
  amount: number;
};

const currencySchema = z.object({
  fromCurrency: z.string().describe('The currency to convert from (e.g., USD, EUR)'),
  toCurrency: z.string().describe('The currency to convert to (e.g., USD, EUR)'),
  amount: z.number().positive().describe('The amount to convert'),
});

type CurrencyInput = z.infer<typeof currencySchema>;

const toolFunction = async ({ fromCurrency, toCurrency, amount }: CurrencyInput) => {
  console.log('Start converting...');

  const currencyFinderKey = process.env.FREE_CURRENCY_KEY;
  const response = await fetch(`https://api.freecurrencyapi.com/v1/latest?apikey=${currencyFinderKey}&base_currency=${fromCurrency}&currencies=${toCurrency}`);

  const data = await response.json();

  const exchangeRate = data.rates[toCurrency];
  const convertedAmount = exchangeRate * amount;
  console.log('Finished converter...', fromCurrency, toCurrency, amount);

  return  {
    fromCurrency,
    toCurrency,
    amount,
    convertedAmount,
    exchangeRate,
  };
};

// export const convertCurrency = tool(
//   toolFunction,
//   {
//     name: 'convertCurrency',
//     description: 'Convert currency to another currency',
//     schema: currencySchema,
//   });

export const convertCurrency = tool(
  async (
    { fromCurrency, toCurrency, amount }: CurrencyInput 
  ) => {
    console.log('Start converting...!', fromCurrency, toCurrency, amount);

    const apiKey = process.env.EXCHANGE_API_KEY;

    const response = await fetch(`https://api.freecurrencyapi.com/v1/latest?apikey=${apiKey}&base_currency=${fromCurrency}&currencies=${toCurrency}`);

    const data = await response.json();

    const exchangeRate = data.data[toCurrency];
    const convertedAmount = exchangeRate * amount;

    console.log('Finished converter...');

    return {
        fromCurrency,
        toCurrency,
        amount,
        convertedAmount,
        exchangeRate
    }
}, 
  {
  name: 'convertCurrency',
  description: 'Convert currency to another currency',
  schema: currencySchema as any,
});
