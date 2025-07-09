#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MongoClient } from 'mongodb';
import { getMongoConnection } from './mongo.js';
import { createMCPServer } from './server.js';

let mongoClient: MongoClient | null = null;

/**
 * Main entry point to start the MCP MongoDB server.
 */
async function main() {
  // Parse command-line arguments (e.g., for future extensions)
  const args = process.argv.slice(2);
  console.warn('args', args);
  const connectionUrlArg = args.find(arg => arg.startsWith('--url='));
  const readOnlyArg = args.includes('--readonly');

  // Determine if read-only mode is enabled
  const readOnlyMode = readOnlyArg || process.env.MCP_MONGODB_READONLY === 'true';

  // Get MongoDB connection URL from env
  const connectionUrl = connectionUrlArg ? connectionUrlArg.split('=')[1] 
    : process.env.MCP_MONGODB_URI || '';

  // If no connection URL from command line, use environment variable
  if (!connectionUrl) {
    console.error('No MongoDB connection URI provided. Set MCP_MONGODB_URI.');
    process.exit(1);
  }

  try {
    // Connect to MongoDB
    const { client, db } = await getMongoConnection(
      connectionUrl,
      readOnlyMode,
    );

    mongoClient = client;

    if (!client || !db) {
      console.error('Failed to connect to MongoDB');
      process.exit(1);
    }

    // Initialize the MCP server with MongoDB handlers
    const server = createMCPServer(client, db, readOnlyMode);
    const transport = new StdioServerTransport();

    // Start MCP server via stdio transport
    await server.connect(transport);
    console.warn('MCP Server connected and ready (mcp-server-mongo)');
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
