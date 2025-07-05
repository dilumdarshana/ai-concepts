import type { ListToolsRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Db, MongoClient } from 'mongodb';

export async function handleListToolsRequest({
  request,
  dbClient,
  db,
  readOnly,
}: {
  request: ListToolsRequest;
  dbClient: MongoClient;
  db: Db;
  readOnly: boolean;
}) {
  return {
    tools: [
      {
        name: 'query',
        description:
          'Execute a MongoDB query with optional execution plan analysis',
        inputSchema: {
          type: 'object',
          properties: {
            collection: {
              type: 'string',
              description: 'Name of the collection to query',
            },
            filter: { 
              type: 'object', 
              description: 'MongoDB query filter. Supports date strings in ISO format (\'2025-01-01T00:00:00Z\') and ISODate(\'2025-01-01T00:00:00Z\') notation' 
            },
            projection: {
              type: 'object',
              description: 'Fields to include/exclude',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of documents to return',
              default: 10,
            },
            explain: {
              type: 'string',
              description: 'Optional: Get query execution information',
              enum: ['queryPlanner', 'executionStats', 'allPlansExecution'],
            },
            objectIdMode: {
              type: 'string',
              description: 'Control how 24-character hex strings are handled',
              enum: ['auto', 'none', 'force'],
              default: 'auto',
            },
          },
          required: ['collection'],
        },
      },
      {
        name: 'serverInfo',
        description:
          'Get MongoDB server information including version, storage engine, and other details',
        inputSchema: {
          type: 'object',
          properties: {
            includeDebugInfo: {
              type: 'boolean',
              description:
                'Include additional debug information about the server',
            },
          },
        },
      },
    ],
  };
}
