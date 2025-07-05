import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const server = new McpServer({
  name: 'currency-converter',
  version: '1.0.0',
});

server.tool(
  'convert-currency',
  'Converts an amount from one currency to another',
  {
    fromCurrency: z.string().describe('The currency to convert from (e.g., USD, EUR)'),
    toCurrency: z.string().describe('The currency to convert to (e.g., USD, EUR)'),
    amount: z.number().positive().describe('The amount to convert'),
  },
  async ({ fromCurrency, toCurrency, amount }) => {
    const currencyFinderKey = process.env.FREE_CURRENCY_KEY;

    const controller = new AbortController(); // fresh signal per request

    console.log('Start calling convertCurrency tool...');

    const response = await fetch(
      `https://api.freecurrencyapi.com/v1/latest?apikey=${currencyFinderKey}&base_currency=${fromCurrency}&currencies=${toCurrency}`,
      { signal: controller.signal },
    );
    const data = await response.json();

    const exchangeRate = data.data[toCurrency];
    const convertedAmount = exchangeRate * amount;

    return {
      content: [
        {
          type: 'text',
          text: `Converted ${amount} ${fromCurrency} to ${toCurrency}: ${convertedAmount} ${toCurrency}`,
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();

server.connect(transport);
