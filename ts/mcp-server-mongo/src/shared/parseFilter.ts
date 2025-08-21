import { ObjectId } from 'mongodb';
import type { ObjectIdConversionMode } from './types.js';

/**
 * Recursively transforms any string values in `filter` that look like
 * ObjectIds or ISO dates into their proper types.
 */
export function parseFilter(
  filter: unknown,
  mode: ObjectIdConversionMode = 'auto',
): Record<string, unknown> {
  if (!filter || typeof filter !== 'object') {
    return {};
  }

  function transform(value: unknown): unknown {
    // ObjectId conversion
    if ( typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) 
      && (mode === 'auto' || mode === 'force')
    ) {
      try {
        return new ObjectId(value);
      } catch {
        // fallback to string
        return value;
      }
    }

    // ISO date string conversion
    if (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/.test(value)
    ) {
      const date = new Date(value);
      return isNaN(date.getTime()) ? value : date;
    }

    // Arrays: map each element
    if (Array.isArray(value)) {
      return value.map(transform);
    }

    // Objects: recurse into each key
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(obj).map(([key, val]) => [key, transform(val)])
      );
    }

    // Everything else: return as‑is
    return value;
  }

  // Transform the whole filter object
  const transformed = transform(filter);

  // Ensure the return type is an object
  return typeof transformed === 'object' && transformed !== null
    ? (transformed as Record<string, unknown>)
    : {};
}
