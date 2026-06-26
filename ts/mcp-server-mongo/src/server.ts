import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { MongoClient, Db } from 'mongodb';
import {
  PingRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { handlePingRequest } from './request/ping.js';
import { handleListToolsRequest } from './request/tools.js';
import { handleCallToolRequest } from './request/callToolRequest.js';
import { handleListResourcesRequest } from './request/listResources.js';
import { handleReadResourceRequest } from './request/readResources.js';
import {
  handleGetPromptRequest,
  handleListPromptsRequest,
} from './request/prompts.js';

/**
 * Creates and configures an MCP server instance for MongoDB.
 *
 * @param dbClient - An active MongoDB client instance.
 * @param db - The connected MongoDB database object.
 * @param readOnly - If true, restricts tool access to read-only operations.
 * @param options - Optional configuration for MCP server (e.g. name, version).
 * @returns An initialized MCP server ready to handle requests.
 */
export function createMCPServer(
  dbClient: MongoClient,
  db: Db,
  readOnly = true,
  options = {},
) {
  // Initialize the MCP server with metadata and capabilities.
  const server = new Server(
    {
      name: 'mongodb', // Name of the MCP server (used in Inspector)
      version: '1.0.0',
      ...options, // Allow overriding name/version/etc.
    },
    {
      capabilities: {
        resources: {}, // Can be populated with static data resources
        tools: {}, // Tools will be dynamically discovered from handlers
        prompts: {}, // Optional: Add prompt templates here
      },
      ...options, // Allow customizing capabilities further
    },
  );

  // Register handler for PingRequest (used in Inspector > Ping tab)
  server.setRequestHandler(PingRequestSchema, (request) =>
    handlePingRequest({ request, dbClient, db, readOnly }),
  );

  // Register handler for ListToolsRequest (Inspector > Tools tab)
  // Lists available tools.
  server.setRequestHandler(ListToolsRequestSchema, (request) =>
    handleListToolsRequest(),
  );

  // Register handler for CallToolRequest (Inspector > Tools > Call Tool tab)
  server.setRequestHandler(CallToolRequestSchema, (request) =>
    handleCallToolRequest({ request, dbClient, db, readOnly }),
  );

  // Register handler for listing available collections as resources.
  server.setRequestHandler(ListResourcesRequestSchema, (request) =>
    handleListResourcesRequest({ request, dbClient, db, readOnly }),
  );

  // Register handler for reading specific resources (collections/documents).
  server.setRequestHandler(ReadResourceRequestSchema, (request) =>
    handleReadResourceRequest({ request, dbClient, db, readOnly }),
  );

  // Register handler for listing available prompts. (Inspector > Prompts tab)
  server.setRequestHandler(ListPromptsRequestSchema, (request) =>
    handleListPromptsRequest(),
  );

  // Register handler for getting a specific prompt template.
  server.setRequestHandler(GetPromptRequestSchema, (request) =>
    handleGetPromptRequest({ request }),
  );

  return server;
}
