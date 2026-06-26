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
      const options = readOnly
        ? { readPreference: ReadPreference.SECONDARY }
        : {};

      client = new MongoClient(url, options);
      await client.connect();
    }

    const db = client.db(); // Use the default DB from URI

    // console.log(`Connected with Mongodb: ${db.databaseName}`);

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
