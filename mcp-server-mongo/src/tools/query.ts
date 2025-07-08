import {
  Collection,
  FindOptions,
  ObjectId,
} from 'mongodb';
import { formatResponse } from '../shared/formatResponse.js';
import { handleError } from '../shared/handleError.js';
import { ObjectIdConversionMode } from '../shared/types.js';
import { parseFilter } from '../shared/parseFilter.js';

/**
 * Executes a MongoDB query based on provided arguments.
 */
export async function handleQueryTool(
  collection: Collection<Document> | null,
  args: Record<string, unknown>,
  objectIdMode: ObjectIdConversionMode = 'auto',
) {
  if (!collection) {
    throw new Error('Collection is required for query operation');
  }
  const { filter, projection, limit, explain, sort } = args;
  const queryFilter = parseFilter(filter, objectIdMode);

  try {
    if (explain) {
      const explainResult = await collection
        .find(queryFilter, {
          projection,
          limit: limit || 100,
          sort,
        } as FindOptions<Document>)
        .explain(explain as string);

      return formatResponse(explainResult);
    }

    const cursor = collection.find(queryFilter, {
      projection,
      limit: limit || 100,
      sort,
    } as FindOptions<Document>);
    const results = await cursor.toArray();

    return formatResponse(results);
  } catch (error) {
    return handleError(error, 'query', collection.collectionName);
  }
}
