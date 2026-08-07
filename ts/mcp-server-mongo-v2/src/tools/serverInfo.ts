import { z } from 'zod';
import type { Db } from 'mongodb';
import { Logger } from '../utils/logger.js';
import { formatResponse } from '../utils/mcpResponse.js';

// Define the schema for the serverInfo tool input (no arguments)
export const serverInfoSchema = z.object({});

// Define the TypeScript type for the input based on the schema
export type ServerInfoInput = z.infer<typeof serverInfoSchema>;

/**
 * Gets MongoDB server information including version, storage engine,
 * and connection details.
 *
 * @param input The validated tool input (empty)
 * @param db The connected MongoDB database object
 * @param readOnly Whether the server is running in read-only mode
 * @param logger Logger instance for logging messages and errors
 * @returns A promise resolving to an MCP tool result with server info
 */
export async function handleServerInfoTool(
  _input: ServerInfoInput,
  db: Db,
  readOnly: boolean,
  logger: Logger,
) {
  try {
    // Get basic server information using buildInfo command
    const buildInfo = await db.command({ buildInfo: 1 });

    const serverInfo = {
      version: buildInfo.version,
      gitVersion: buildInfo.gitVersion,
      modules: buildInfo.modules,
      allocator: buildInfo.allocator,
      javascriptEngine: buildInfo.javascriptEngine,
      sysInfo: buildInfo.sysInfo,
      storageEngines: buildInfo.storageEngines,
      debug: buildInfo.debug,
      maxBsonObjectSize: buildInfo.maxBsonObjectSize,
      openssl: buildInfo.openssl,
      buildEnvironment: buildInfo.buildEnvironment,
      bits: buildInfo.bits,
      ok: buildInfo.ok,
      connectionInfo: {
        readOnlyMode: readOnly,
        readPreference: readOnly ? 'secondary' : 'primary',
      },
    };

    logger.info('Retrieved MongoDB server information');
    return formatResponse(serverInfo);
  } catch (error) {
    logger.error(`Error getting server information: ${error}`);
    return formatResponse({ error: `Error: ${error}` });
  }
}
