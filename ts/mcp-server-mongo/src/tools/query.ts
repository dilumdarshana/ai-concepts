import { z } from 'zod';
import type { Db, Sort } from 'mongodb';
import { Logger } from '../utils/logger.js';
import { formatResponse } from '../utils/mcpResponse.js';
import { parseFilter } from '../utils/parseFilter.js';
import type { ObjectIdConversionMode } from '../types.js';

// Define the schema for the query tool input
export const querySchema = z.object({
  collection: z.string().describe('Name of the collection to query'),
  filter: z
    .record(z.string(), z.any())
    .optional()
    .describe(
      "MongoDB query filter. Supports date strings in ISO format ('2025-01-01T00:00:00Z') and ISODate('2025-01-01T00:00:00Z') notation",
    ),
  projection: z
    .record(z.string(), z.any())
    .optional()
    .describe('Fields to include/exclude'),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum number of documents to return'),
  sort: z.record(z.string(), z.any()).optional().describe('Sort order'),
  explain: z
    .enum(['queryPlanner', 'executionStats', 'allPlansExecution'])
    .optional()
    .describe('Get query execution information'),
  objectIdMode: z
    .enum(['auto', 'none', 'force'])
    .optional()
    .describe('Control how 24-character hex strings are handled'),
});

// Define the TypeScript type for the input based on the schema
export type QueryInput = z.infer<typeof querySchema>;

/**
 * Executes a MongoDB query based on provided arguments.
 *
 * @param input The validated tool input
 * @param db The connected MongoDB database object
 * @param readOnly Whether the server is running in read-only mode
 * @param logger Logger instance for logging messages and errors
 * @returns A formatted MCP tool result
 */
export async function handleQueryTool(
  input: QueryInput,
  db: Db,
  _readOnly: boolean,
  logger: Logger,
) {
  const { collection: collectionName, filter, projection, limit, sort } = input;
  const objectIdMode = (input.objectIdMode ?? 'auto') as ObjectIdConversionMode;
  const collection = db.collection(collectionName);
  const queryFilter = parseFilter(filter, objectIdMode);

  const options = {
    projection,
    limit: limit ?? 100,
    sort: sort as Sort | undefined,
  };

  try {
    if (input.explain) {
      const explainResult = await collection
        .find(queryFilter, options)
        .explain(input.explain);

      return formatResponse(explainResult);
    }

    const results = await collection.find(queryFilter, options).toArray();

    logger.info(`Query on ${collectionName} returned ${results.length} docs`);
    return formatResponse(results);
  } catch (error) {
    logger.error(`Error querying collection ${collectionName}: ${error}`);
    return formatResponse({ error: `Error: ${error}` });
  }
}
