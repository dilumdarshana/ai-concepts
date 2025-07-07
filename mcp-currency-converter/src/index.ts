#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { convertCurrencyTool } from './tools/convertCurrency.js';
import { listCurrenciesTool } from './tools/listCurrencies.js';

const server = new McpServer({
  name: 'currencyConverter',
  version: '1.0.0',
});

// Tool no: 1
server.tool(
  convertCurrencyTool.name,
  convertCurrencyTool.description,
  convertCurrencyTool.schema.shape,
  convertCurrencyTool.handler,
);

// Tool no: 2
server.tool(
  listCurrenciesTool.name,
  listCurrenciesTool.description,
  listCurrenciesTool.schema.shape,
  listCurrenciesTool.handler,
);

const transport = new StdioServerTransport();

server.connect(transport);
