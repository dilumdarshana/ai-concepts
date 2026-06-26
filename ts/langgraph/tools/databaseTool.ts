import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

interface TableInfo {
  table_name: string;
  table_type: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  ordinal_position: number;
}

export const getDatabaseSchema = tool(
  async () => {
    try {
      const rows = await prisma.$queryRawUnsafe<TableInfo[]>(
        `SELECT
          t.table_name,
          t.table_type,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          c.ordinal_position
        FROM information_schema.tables t
        JOIN information_schema.columns c
          ON c.table_name = t.table_name AND c.table_schema = t.table_schema
        WHERE t.table_schema = 'public'
        ORDER BY t.table_name, c.ordinal_position`,
      );

      const schema: Record<string, { type: string; columns: Array<{ name: string; type: string; nullable: boolean; default: string | null }> }> = {};

      for (const row of rows) {
        if (!schema[row.table_name]) {
          schema[row.table_name] = { type: row.table_type, columns: [] };
        }
        schema[row.table_name].columns.push({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === 'YES',
          default: row.column_default,
        });
      }

      return JSON.stringify(schema, null, 2);
    } catch (error) {
      console.error('Error getting database schema:', error);
      return 'Failed to retrieve database schema';
    }
  },
  {
    name: 'getDatabaseSchema',
    description:
      'Get the database schema including all tables, their columns, and types. Call this first to understand the database structure before running queries.',
    schema: z.object({}),
  },
);

export const queryDatabase = tool(
  async ({ query }: { query: string }) => {
    const trimmed = query.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT')) {
      return 'Only SELECT queries are allowed for read-only access';
    }

    try {
      const result = await prisma.$queryRawUnsafe(query);
      return JSON.stringify(
        result,
        (_key, value) => (typeof value === 'bigint' ? Number(value) : value),
        2,
      );
    } catch (error) {
      console.error('Error executing query:', error);
      return `Failed to execute query: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
  {
    name: 'queryDatabase',
    description:
      'Execute a read-only SQL SELECT query against the database. Returns the result as JSON. Use getDatabaseSchema first to learn the table structure.',
    schema: z.object({
      query: z.string().describe('The SQL SELECT query to execute'),
    }) as any,
  },
);
