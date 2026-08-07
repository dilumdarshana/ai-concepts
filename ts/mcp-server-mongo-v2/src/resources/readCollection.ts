import type { ReadResourceResult } from '@modelcontextprotocol/server';
import type { Db } from 'mongodb';
import { Logger } from '../utils/logger.js';

interface FieldSummary {
  name: string;
  types: string[];
  nullable: boolean;
  examples: unknown[];
}

interface FieldAccumulator {
  name: string;
  types: Set<string>;
  nullable: boolean;
  examples: unknown[];
}

interface CollectionSchema {
  type: string;
  name: string;
  fields: FieldSummary[];
  indexes: Array<{
    name: string | undefined;
    keys: Record<string, unknown>;
  }>;
  documentCount: number | string | null;
  sampleSize: number;
  lastUpdated: string;
}

/**
 * Reads a MongoDB collection as an MCP resource:
 *  - Counts documents
 *  - Grabs a small sample
 *  - Infers a basic schema summary (field names, types, nullability, examples)
 *
 * @param uri The URI for the resource being accessed (contains collection name)
 * @param db The connected MongoDB database object
 * @param readOnly Whether the server is running in read-only mode
 * @param logger Logger instance for logging messages and errors
 * @returns A promise resolving to a ReadResourceResult with the schema summary
 */
export async function readCollection(
  uri: URL,
  db: Db,
  _readOnly: boolean,
  logger: Logger,
): Promise<ReadResourceResult> {
  const collectionName = uri.pathname.replace(/^\//, '');

  try {
    const collection = db.collection(collectionName);

    // Get indexes for the collection
    const indexes = await collection.indexes();

    // Get document count with timeout protection
    let documentCount: number | string | null = null;
    try {
      documentCount = await Promise.race<number>([
        collection.countDocuments(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Count operation timed out')),
            5000,
          ),
        ),
      ]);
    } catch (countError) {
      logger.warn(
        `Count op failed or timed out for "${collectionName}": ${countError}`,
      );
      // Fallback: use collStats.count if available
      try {
        const stats = await db.command({ collStats: collectionName });
        documentCount =
          typeof stats.count === 'number' ? stats.count : 'unknown';
      } catch {
        documentCount = 'unknown (collStats failed)';
      }
    }

    // Set sample size for schema inference
    const sampleSize = 100;

    // Fetch a sample of documents
    const samples = await collection.find({}).limit(sampleSize).toArray();

    // Build a simple field summary from the samples
    const fieldMap = new Map<string, FieldAccumulator>();

    for (const doc of samples) {
      for (const [key, value] of Object.entries(doc)) {
        const existing = fieldMap.get(key) ?? {
          name: key,
          types: new Set<string>(),
          nullable: false,
          examples: [] as unknown[],
        };
        if (value === null || value === undefined) {
          existing.nullable = true;
        } else {
          existing.types.add(
            typeof value === 'object' ? value.constructor.name : typeof value,
          );
          if (existing.examples.length < 3) {
            existing.examples.push(value);
          }
        }
        fieldMap.set(key, existing);
      }
    }

    const fields: FieldSummary[] = Array.from(fieldMap.values()).map((f) => ({
      name: f.name,
      types: Array.from(f.types),
      nullable: f.nullable,
      examples: f.examples,
    }));

    // Assemble the schema object
    const schema: CollectionSchema = {
      type: 'collection',
      name: collectionName,
      fields,
      indexes: indexes.map((idx) => ({
        name: idx.name,
        keys: idx.key,
      })),
      documentCount,
      sampleSize: samples.length,
      lastUpdated: new Date().toISOString(),
    };

    logger.info(`Read schema for collection ${collectionName}`);
    return {
      contents: [
        {
          uri: uri.toString(),
          mimeType: 'application/json',
          text: JSON.stringify(schema, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error(`Error reading collection ${collectionName}: ${error}`);
    throw new Error(`Failed to read collection ${collectionName}: ${error}`);
  }
}
