import { createTool } from '@voltagent/core';
import { z } from 'zod';

/**
 * A tool for fetching currency conversion information
 * This is a mock implementation - replace with real weather API.
 */
export const convertCurrencyTool = createTool({
  name: 'convertCurrency',
  description: 'Converts an amount from one currency to another',
  parameters: z.object({
    fromCurrency: z.string().describe('The currency to convert from (e.g., USD, EUR)'), // Source currency
    toCurrency: z.string().describe('The currency to convert to (e.g., USD, EUR)'),   // Target currency
    amount: z.number().positive().describe('The amount to convert'),                 // Amount to be converted
  }),
  execute: async ({ fromCurrency, toCurrency, amount }) => {
    // TODO: Replace this mock with a real currency convert API call

    // Extract the exchange rate based on the response structure
    const exchangeRate = 0.5; // Mock exchange rate for demonstration

    // Mock response structure
    const mockCurrencyData = {
      fromCurrency,
      toCurrency,
      amount,
      exchangeRate, // Mock exchange rate
    };

    // Calculate the converted amount using the exchange rate
    const convertedAmount = parseFloat((exchangeRate * amount).toFixed(2));

    return {
      currency: mockCurrencyData,
      message: `Converted ${amount} ${fromCurrency} to ${toCurrency} : ${convertedAmount} ${toCurrency}`,
    };
  },
});
