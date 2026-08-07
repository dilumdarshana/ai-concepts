import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import dotenv from 'dotenv';
import type { Db } from 'mongodb';
import { PACKAGE_NAME, VERSION } from './utils/constants.js';
import { createHttpTransport } from './transport/httpTransport.js';
import { createStdioTransport } from './transport/stdioTransport.js';
import { createSseTransport } from './transport/sseTransport.js';
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
 * @param dbClient An active MongoDB client instance
 * @param db The connected MongoDB database object
 * @param readOnly If true, restricts tool access to read-only operations
 */
export function createMcpServer(db: Db, readOnly = true) {
  // Initialize logger for logging server activities
  const logger = Logger.log();

  // Create the MCP server instance with basic configuration
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

  // Configure the transport layer based on the TRANSPORT environment variable
  if (process.env.TRANSPORT === 'http') {
    createHttpTransport(server, logger);
  } else if (process.env.TRANSPORT === 'stdio') {
    const transport = createStdioTransport();
    server.connect(transport);
  } else if (process.env.TRANSPORT === 'sse') {
    createSseTransport(server, logger);
  } else {
    logger.error(
      'Invalid transport specified. Please set TRANSPORT to http | stdio | sse',
    );
    process.exit(1);
  }
}
