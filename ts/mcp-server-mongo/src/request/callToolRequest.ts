import type { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Db, MongoClient, Collection } from 'mongodb';
import { handleQueryTool } from '../tools/query.js';
import { handleServerInfoTool } from '../tools/serverInfo.js';
import { handleCountTool } from '../tools/count.js';

// Define supported operations
type Tools =
  | 'query'
  | 'aggregate'
  | 'update'
  | 'serverInfo'
  | 'insert'
  | 'createIndex'
  | 'count'
  | 'listCollections';

// Define operations that require a collection
const COLLECTION_OPERATIONS = [
  'query',
  'aggregate',
  'update',
  'insert',
  'createIndex',
  'count',
];

// ObjectId conversion settings
type ObjectIdConversionMode = 'auto' | 'none' | 'force';

export function handleCallToolRequest({
  request,
  dbClient,
  db,
  readOnly,
}: {
  request: CallToolRequest;
  dbClient: MongoClient;
  db: Db;
  readOnly: boolean;
}) {
  const { name: toolName, arguments: args = {} } = request.params;
  const operation = toolName as Tools;
  let collection: Collection<Document> | null = null;

  const objectIdMode = (args.objectIdMode as ObjectIdConversionMode) || 'auto';
  
  // Collection not needed for every operations
  if (COLLECTION_OPERATIONS.includes(operation)) {
    const collectionName = args.collection as string;
  
    if (!collectionName) {
      throw new Error('Missing required argument: collection');
    }
    
    // Get collection only if the operation requires it
    collection = db.collection(collectionName);
  }

  // Route to the appropriate handler based on operation name
  switch (operation) {
    case 'query':
      return handleQueryTool(collection, args, objectIdMode);
    case 'serverInfo':
      return handleServerInfoTool(db, readOnly);
    case 'count':
      return handleCountTool(collection, args, objectIdMode);
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}
