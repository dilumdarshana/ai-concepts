import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { MongoClient, Db } from 'mongodb';
import {
  PingRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { handlePingRequest } from './request/ping.js';
import { handleListToolsRequest } from './request/tools.js';

export function createMCPServer (
  dbClient: MongoClient,
  db: Db,
  readOnly = true,
  options = {},
) {
  const server = new Server(
    {
      name: 'mongodb',
      version: '1.0.0',
      ...options,
    },
    {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {},
      },
      ...options,
    },
  );

  server.setRequestHandler(PingRequestSchema, (request) => 
    handlePingRequest({ request, dbClient, db, readOnly })
  );

  server.setRequestHandler(ListToolsRequestSchema, (request) =>
    handleListToolsRequest({ request, dbClient, db, readOnly }),
  );

  return server;
}
