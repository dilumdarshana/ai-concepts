#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const server = new McpServer({
  name: 'currencyConverter',
  version: '1.0.0',
});

// Tool no: 1
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

    if (!currencyFinderKey) {
      throw new Error('Missing FREE_CURRENCY_KEY in environment variables');
    }

    console.log(`🔁 Converting ${amount} ${fromCurrency} to ${toCurrency}`);

    const response = await fetch(
      `https://api.freecurrencyapi.com/v1/latest?apikey=${currencyFinderKey}&base_currency=${fromCurrency}&currencies=${toCurrency}`
    );

    // Validation
    if (!response.ok) {
      throw new Error(`Currency API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.data || !data.data[toCurrency]) {
      throw new Error(`Invalid API response: missing exchange rate for ${toCurrency}`);
    }

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

// Tool no: 2
server.tool(
  'list-currencies',
  'Lists all supported currencies',
  {},
  async () => {
    const currencyFinderKey = process.env.FREE_CURRENCY_KEY;

    if (!currencyFinderKey) {
      throw new Error('Missing FREE_CURRENCY_KEY in environment variables');
    }

    console.log('📜 Listing supported currencies');

    const response = await fetch(
      `https://api.freecurrencyapi.com/v1/currencies?apikey=${currencyFinderKey}`
    );

    // Validation
    if (!response.ok) {
      throw new Error(`Currency API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      content: [
        {
          type: 'text',
          text: `Supported currencies: ${Object.keys(data).join(', ')}`,
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();

server.connect(transport);
