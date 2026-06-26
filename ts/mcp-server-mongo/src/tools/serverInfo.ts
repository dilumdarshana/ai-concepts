import type { Db } from 'mongodb';
import { formatResponse } from '../shared/formatResponse.js';
import { handleError } from '../shared/handleError.js';

export async function handleServerInfoTool(db: Db, isReadOnlyMode: boolean) {
  try {
    // Get basic server information using buildInfo command
    const buildInfo = await db.command({ buildInfo: 1 });

    // Construct the response
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
      status: {},
      connectionInfo: {
        readOnlyMode: isReadOnlyMode,
        readPreference: isReadOnlyMode ? 'secondary' : 'primary',
      },
    };

    return formatResponse(serverInfo);
  } catch (error) {
    return handleError(error, 'get server information');
  }
}
