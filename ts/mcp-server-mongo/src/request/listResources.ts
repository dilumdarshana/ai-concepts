import type { ListResourcesRequest } from '@modelcontextprotocol/sdk/types.js';
import type { MongoClient, Db, CollectionInfo } from 'mongodb';

export async function handleListResourcesRequest({
  request,
  dbClient,
  db,
  readOnly,
}: {
  request: ListResourcesRequest;
  dbClient: MongoClient;
  db: Db;
  readOnly: boolean;
}) {
  try {
    const collections = await db.listCollections().toArray();

    return {
      resources: collections.map((collection: CollectionInfo) => ({
        uri: `mongodb:///${collection.name}`,
        mimeType: 'application/json',
        name: collection.name,
        description: `MongoDB collection: ${collection.name}`,
      })),
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to list collections: ${error.message}`);
    }
    throw new Error('Failed to list collections: Unknown error');
  }
}
