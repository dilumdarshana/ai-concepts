import {
  MongoClient,
  type Db,
  type MongoClientOptions,
  ReadPreference,
} from 'mongodb';

/**
 * Owns the MongoDB client lifecycle for the MCP server.
 *
 * Encapsulates connection creation, the default database lookup, and graceful
 * shutdown so callers never touch the raw `MongoClient` directly.
 */
export class MongoConnection {
  private client: MongoClient | null = null;

  constructor(
    private readonly url: string,
    private readonly readOnly: boolean,
  ) {}

  /**
   * Connects to MongoDB and returns the default database from the URI.
   * Reuses an existing connection on subsequent calls.
   *
   * @throws if the connection cannot be established
   */
  async connect(): Promise<Db> {
    if (this.client) {
      return this.client.db();
    }

    const options: MongoClientOptions = this.readOnly
      ? { readPreference: ReadPreference.SECONDARY }
      : {};

    this.client = new MongoClient(this.url, options);
    await this.client.connect();

    return this.client.db();
  }

  /**
   * Closes the underlying connection, if any. Safe to call multiple times.
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}
