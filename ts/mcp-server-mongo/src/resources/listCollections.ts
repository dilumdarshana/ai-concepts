import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { Db } from 'mongodb';
import { Logger } from '../utils/logger.js';

/**
 * Lists all collections in the connected MongoDB database as a resource.
 *
 * @param uri The URI for the resource being accessed
 * @param db The connected MongoDB database object
 * @param readOnly Whether the server is running in read-only mode
 * @param logger Logger instance for logging messages and errors
 * @returns A promise resolving to a ReadResourceResult with the collection list
 */
export async function listCollections(
  uri: URL,
  db: Db,
  _readOnly: boolean,
  logger: Logger,
): Promise<ReadResourceResult> {
  try {
    const collections = await db.listCollections().toArray();
    const names = collections.map((c) => c.name);

    logger.info(`Listed ${names.length} collections`);
    return {
      contents: [
        {
          uri: uri.toString(),
          text: JSON.stringify(names, null, 2),
          mimeType: 'application/json',
        },
      ],
    };
  } catch (error) {
    logger.error(`Error listing collections: ${error}`);
    throw new Error(`Failed to list collections: ${error}`);
  }
}
