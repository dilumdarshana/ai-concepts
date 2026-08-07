import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Db } from 'mongodb';
import { Logger } from './logger.js';
import { handleQueryTool, querySchema } from '../tools/query.js';
import { handleCountTool, countSchema } from '../tools/count.js';
import { handleServerInfoTool, serverInfoSchema } from '../tools/serverInfo.js';
import { listCollections } from '../resources/listCollections.js';
import { readCollection } from '../resources/readCollection.js';
import { registerPrompts as registerMongoPrompts } from '../prompts/mongoPrompts.js';

/**
 * Registers all tools to the MCP server.
 * @param server The MCP server instance
 * @param db The connected MongoDB database object
 * @param readOnly Whether the server is running in read-only mode
 * @param logger The logger instance
 */
export function registerTools(
  server: McpServer,
  db: Db,
  readOnly: boolean,
  logger: Logger,
) {
  server.registerTool(
    'query',
    {
      title: 'query',
      description:
        'Execute a MongoDB query with optional execution plan analysis',
      inputSchema: querySchema,
      annotations: {
        title: 'query',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    (input) => handleQueryTool(input, db, readOnly, logger),
  );

  server.registerTool(
    'count',
    {
      title: 'count',
      description: 'Count documents in a collection matching a query',
      inputSchema: countSchema,
      annotations: {
        title: 'count',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    (input) => handleCountTool(input, db, readOnly, logger),
  );

  server.registerTool(
    'serverInfo',
    {
      title: 'serverInfo',
      description:
        'Get MongoDB server information including version, storage engine, and other details',
      inputSchema: serverInfoSchema,
      annotations: {
        title: 'serverInfo',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    (input) => handleServerInfoTool(input, db, readOnly, logger),
  );
}

/**
 * Registers all resources to the MCP server.
 * @param server The MCP server instance
 * @param db The connected MongoDB database object
 * @param readOnly Whether the server is running in read-only mode
 * @param logger The logger instance
 */
export function registerResources(
  server: McpServer,
  db: Db,
  readOnly: boolean,
  logger: Logger,
) {
  server.registerResource(
    'list-collections',
    'mongodb://collections',
    {
      description: 'Lists all collections in the MongoDB database',
      title: 'list-collections',
      mimeType: 'application/json',
    },
    (uri) => listCollections(uri, db, readOnly, logger),
  );

  server.registerResource(
    'collection-schema',
    'mongodb://collections/{name}',
    {
      description: 'Reads the schema summary of a MongoDB collection',
      title: 'collection-schema',
      mimeType: 'application/json',
    },
    (uri) => readCollection(uri, db, readOnly, logger),
  );
}

/**
 * Registers all prompts to the MCP server.
 * @param server The MCP server instance
 * @param logger The logger instance
 */
export function registerPrompts(server: McpServer, logger: Logger) {
  registerMongoPrompts(server, logger);
}
