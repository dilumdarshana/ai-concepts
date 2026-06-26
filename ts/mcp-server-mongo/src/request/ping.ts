/**
 * MCP client use this request to check if the server is alive.
 * If the server is not available, MCP client will not send this tool to LLM
 */
import type { PingRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Db, MongoClient } from 'mongodb';

export async function handlePingRequest({
  request,
  dbClient,
  db,
  readOnly,
}: {
  request: PingRequest;
  dbClient: MongoClient;
  db: Db;
  readOnly: boolean;
}) {
  try {
    // Check MongoDB connection
    if (!dbClient) {
      throw new Error('MongoDB connection is not available');
    }

    // Ping MongoDB to verify connection
    const pong = await db.command({ ping: 1 });

    if (pong.ok !== 1) {
      throw new Error(`MongoDB ping failed: ${pong.errmsg}`);
    }

    return {};
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`MongoDB ping failed: ${error.message}`);
    }
    throw new Error('MongoDB ping failed: Unknown error');
  }
}
