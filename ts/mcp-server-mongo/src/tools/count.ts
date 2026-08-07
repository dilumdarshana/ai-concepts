import { z } from 'zod';
import type { Db } from 'mongodb';
import { Logger } from '../utils/logger.js';
import { formatResponse } from '../utils/mcpResponse.js';
import { parseFilter } from '../utils/parseFilter.js';
import type { ObjectIdConversionMode } from '../types.js';

// Define the schema for the count tool input
export const countSchema = z.object({
  collection: z.string().describe('Collection name'),
  query: z
    .record(z.string(), z.any())
    .optional()
    .describe('Query filter to count'),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Max documents to count'),
  skip: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Docs to skip before counting'),
  objectIdMode: z
    .enum(['auto', 'none', 'force'])
    .optional()
    .describe('Control how 24-character hex strings are handled'),
});

// Define the TypeScript type for the input based on the schema
export type CountInput = z.infer<typeof countSchema>;

/**
 * Counts documents in a collection matching a query.
 *
 * @param input The validated tool input
 * @param db The connected MongoDB database object
 * @param readOnly Whether the server is running in read-only mode
 * @param logger Logger instance for logging messages and errors
 * @returns A promise resolving to an MCP tool result with the count
 */
export async function handleCountTool(
  input: CountInput,
  db: Db,
  _readOnly: boolean,
  logger: Logger,
) {
  const { collection: collectionName, query, limit, skip } = input;
  const objectIdMode = (input.objectIdMode ?? 'auto') as ObjectIdConversionMode;
  const collection = db.collection(collectionName);
  const filter = parseFilter(query, objectIdMode);

  try {
    const options = {
      ...(typeof limit === 'number' && { limit }),
      ...(typeof skip === 'number' && { skip }),
    };

    const count = await collection.countDocuments(filter, options);

    logger.info(`Counted ${count} docs in ${collectionName}`);
    return formatResponse({ count, ok: 1 });
  } catch (error) {
    logger.error(`Error counting documents in ${collectionName}: ${error}`);
    return formatResponse({ error: `Error: ${error}` });
  }
}
