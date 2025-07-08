import {
  Collection,
  CountDocumentsOptions,
} from 'mongodb';
import { ObjectIdConversionMode } from '../shared/types.js';
import { formatResponse } from '../shared/formatResponse.js';
import { handleError } from '../shared/handleError.js';
import { parseFilter } from '../shared/parseFilter.js';

/**
 * MCP tool handler to count documents in a collection.
 */
export async function handleCountTool(
  collection: Collection<Document> | null,
  args: Record<string, unknown>,
  objectIdMode: ObjectIdConversionMode = 'auto',
) {
  if (!collection) {
    throw new Error('Collection is required for count operation');
  }
  const { query, limit, skip } = args;
  const filter = parseFilter(query, objectIdMode);

  try {
    if (!collection) {
      throw new Error('Collection is required for query operation');
    }

    const options: CountDocumentsOptions = {
      ...(typeof limit     === 'number' && { limit: limit }),
      ...(typeof skip      === 'number' && { skip: skip }),
    }

    const count = await collection.countDocuments(filter, options);
  
    return formatResponse({
      count,
      ok: 1,
    });
  } catch (error) {
    return handleError(error, 'count documents', collection.collectionName);
  }
}
