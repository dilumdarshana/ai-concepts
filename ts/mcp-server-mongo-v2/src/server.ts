import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import dotenv from 'dotenv';
import type { Db } from 'mongodb';
import { PACKAGE_NAME, VERSION } from './utils/constants.js';
import { createHttpTransport } from './transport/httpTransport.js';
import { Logger } from './utils/logger.js';
import {
  registerPrompts,
  registerResources,
  registerTools,
} from './utils/registrations.js';

// Load environment variables from .env file to configure the application
dotenv.config({ quiet: true });

/**
 * Creates and initializes the MCP server with the chosen transport.
 * This function sets up the server, registers tools and resources, and
 * configures the transport layer based on the TRANSPORT environment variable.
 *
 * The v2 SDK is factory-based: `serveStdio` and `createMcpHandler` invoke the
 * factory to build a fresh server instance per connection.
 *
 * @param db The connected MongoDB database object
 * @param readOnly If true, restricts tool access to read-only operations
 */
export function createMcpServer(db: Db, readOnly = true) {
  // Initialize logger for logging server activities
  const logger = Logger.log();

  // Factory builds a fresh server per connection, capturing shared state
  // (db, readOnly, logger) in a closure.
  const factory = () => {
    const server = new McpServer(
      {
        name: PACKAGE_NAME,
        version: VERSION,
      },
      {
        capabilities: {
          resources: {},
          tools: {},
          prompts: {},
        },
      },
    );

    // Register tools, resources, and prompts to the server
    registerTools(server, db, readOnly, logger);
    registerResources(server, db, readOnly, logger);
    registerPrompts(server, logger);

    return server;
  };

  // Configure the transport layer based on the TRANSPORT environment variable
  if (process.env.TRANSPORT === 'http') {
    createHttpTransport(factory, logger);
  } else if (process.env.TRANSPORT === 'stdio') {
    serveStdio(factory);
  } else {
    logger.error(
      'Invalid transport specified. Please set TRANSPORT to http | stdio',
    );
    process.exit(1);
  }
}
