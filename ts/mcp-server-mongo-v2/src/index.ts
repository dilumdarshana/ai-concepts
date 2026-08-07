#!/usr/bin/env node
import dotenv from 'dotenv';
import { MongoConnection } from './mongo.js';
import { createMcpServer } from './server.js';

// Load environment variables from .env file
dotenv.config({ quiet: true });

let connection: MongoConnection | null = null;

/**
 * Main entry point to start the MCP MongoDB server.
 */
async function main() {
  // Parse command-line arguments (e.g., for future extensions)
  const args = process.argv.slice(2);
  const connectionUrlArg = args.find((arg: string) => arg.startsWith('--url='));
  const readOnlyArg = args.includes('--readonly');

  // Determine if read-only mode is enabled
  const readOnlyMode =
    readOnlyArg || process.env.MCP_MONGODB_READONLY === 'true';

  // Get MongoDB connection URL from env
  const connectionUrl = connectionUrlArg
    ? connectionUrlArg.split('=')[1]
    : process.env.MCP_MONGODB_URI || '';

  // If no connection URL from command line, use environment variable
  if (!connectionUrl) {
    console.error('No MongoDB connection URI provided. Set MCP_MONGODB_URI.');
    process.exit(1);
  }

  // Connect to MongoDB and start the MCP server with MongoDB handlers
  connection = new MongoConnection(connectionUrl, readOnlyMode);
  const db = await connection.connect();
  createMcpServer(db, readOnlyMode);
}

// Graceful shutdown
// Catches when you press Ctrl+C in the terminal.
process.on('SIGINT', async () => {
  await connection?.close();
  process.exit(0);
});

// Catches termination signals from process managers (like Docker, PM2, kill, etc.).
process.on('SIGTERM', async () => {
  await connection?.close();
  process.exit(0);
});

// Start server
main().catch((error) => {
  console.error('Failed to connect to MongoDB:', error);
  process.exit(1);
});
