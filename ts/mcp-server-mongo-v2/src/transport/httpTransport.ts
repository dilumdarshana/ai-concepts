import { createMcpHandler, type McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import express from 'express';
import cors from 'cors';
import { Logger } from '../utils/logger.js';

/**
 * Creates an instance of the MCP HTTP transport.
 * This allows communication over HTTP for remote use.
 *
 * The v2 SDK exposes a web-standard handler (`createMcpHandler`) which is
 * adapted to a Node/Express middleware via `toNodeHandler`.
 *
 * @param factory Builds a fresh server instance per connection
 * @param logger The logger instance
 */
export function createHttpTransport(factory: () => McpServer, logger: Logger) {
  const app = express();
  app.use(
    cors({
      origin: '*', // Configure appropriately for production
    }),
  );

  const handler = createMcpHandler(factory, {
    onerror: (error) => logger.error(`MCP HTTP handler error: ${error}`),
  });
  const mcpHandler = toNodeHandler(handler);

  app.all('/mcp', mcpHandler);

  // Health check endpoint
  app.get('/', (_req, res) => {
    res.send('MongoDB MCP Server is running');
  });

  // Start the server
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    logger.info(`MCP HTTP server listening on port ${port}`);
  });

  return app;
}
