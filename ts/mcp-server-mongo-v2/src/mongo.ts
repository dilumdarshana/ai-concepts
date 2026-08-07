import { MongoClient, type Db, ReadPreference } from 'mongodb';

let client: MongoClient;

export async function getMongoConnection(
  url: string,
  readOnly: boolean,
): Promise<{
  db: Db | null;
  client: MongoClient | null;
}> {
  try {
    if (!client) {
      client = new MongoClient(
        url,
        readOnly ? ({ readPreference: ReadPreference.SECONDARY } as any) : {},
      );

      await client.connect();
    }

    const db = client.db(); // Use the default DB from URI

    return {
      client,
      db,
    };
  } catch (error) {
    console.error('Failed to connect with mongodb', error);
    return {
      client: null,
      db: null,
    };
  }
}
