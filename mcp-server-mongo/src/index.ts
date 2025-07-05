#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MongoClient } from 'mongodb';
import { getMongoConnection } from './mongo.js';
import { createMCPServer } from './server.js';

let mongoClient: MongoClient | null;

async function main() {
  let connectionUrl = '';
  let readOnlyMode = process.env.MCP_MONGODB_READONLY === 'true' || false;

  const args = process.argv.slice(2);
  console.log('args', args);
  // If no connection URL from command line, use environment variable
  if (!connectionUrl) {
    connectionUrl = process.env.MCP_MONGODB_URI || '';
  }

  try {
    const { client, db } = await getMongoConnection(
      connectionUrl,
      readOnlyMode,
    );

    mongoClient = client;

    if (!client || !db) {
      console.error('Failed to connect to MongoDB');
      process.exit(1);
    }

    // Pass db instead of client to createServer
    const server = createMCPServer(client, db, readOnlyMode);

    const transport = new StdioServerTransport();

    await server.connect(transport);
    console.warn('mcp-server-mongo MCP Server connected successfully');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    if (mongoClient) {
      await mongoClient.close();
    }
    process.exit(1);
  }
}

// Graceful shutdown
// Catches when you press Ctrl+C in the terminal.
process.on('SIGINT', async () => {
  if (mongoClient) await mongoClient.close();
  process.exit(0);
});

// Catches termination signals from process managers (like Docker, PM2, kill, etc.).
process.on('SIGTERM', async () => {
  if (mongoClient) await mongoClient.close();
  process.exit(0);
});

// Start server
main().catch((error) => {
  console.error('Error on start MCP Server', error);
  process.exit(1);
});
