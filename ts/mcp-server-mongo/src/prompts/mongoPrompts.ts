import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Logger } from '../utils/logger.js';
import { formatMessageResponse } from '../utils/mcpResponse.js';

const collectionArg = z.string().describe('Name of the collection');

interface PromptDef {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  template: string;
}

const PROMPT_DEFS: PromptDef[] = [
  {
    name: 'analyse-collection',
    description: 'Analyse a MongoDB collection structure and provide insights',
    schema: z.object({ collection: collectionArg }),
    template: `Analyse the MongoDB collection "{{collection}}" and provide:
      1. Schema overview (field types and structure)
      2. Data quality insights
      3. Recommended queries or operations
      4. Any potential issues or optimizations

      Use the available MongoDB tools to inspect the collection.`,
  },
  {
    name: 'query-helper',
    description: 'Get help writing MongoDB queries for a specific collection',
    schema: z.object({
      collection: collectionArg,
      goal: z.string().describe('What you want to achieve with the query'),
    }),
    template: `Help me write a MongoDB query for the "{{collection}}" collection.
      Goal: {{goal}}

      Please:
      1. First examine the collection structure
      2. Suggest the most appropriate query
      3. Explain the query logic
      4. Provide alternatives if applicable

      Use the available MongoDB tools to inspect the collection first.`,
  },
  {
    name: 'data-exploration',
    description: 'Explore and summarise data in a collection',
    schema: z.object({ collection: collectionArg }),
    template: `Explore the "{{collection}}" collection and provide a data summary including:
      1. Total document count
      2. Sample documents
      3. Field distribution and common values
      4. Date ranges (if applicable)
      5. Key insights about the data

      Use the available MongoDB tools to gather this information.`,
  },
  {
    name: 'performance-review',
    description: 'Review collection performance and suggest optimisations',
    schema: z.object({ collection: collectionArg }),
    template: `Review the performance of the "{{collection}}" collection:
      1. Check existing indexes
      2. Analyze collection size and document structure
      3. Identify potential performance bottlenecks
      4. Suggest index optimizations
      5. Recommend query patterns

      Use the available MongoDB tools to gather performance metrics.`,
  },
  {
    name: 'find-recent',
    description: 'Find recent documents in a collection',
    schema: z.object({
      collection: collectionArg,
      days: z
        .string()
        .optional()
        .describe('Number of days to look back (default: 7)'),
    }),
    template: `Find documents in the "{{collection}}" collection from the last {{days}} days.

      First examine the collection to identify date fields, then query for recent documents.
      If no date field is obvious, show the most recently added documents based on _id.

      Use the available MongoDB tools to inspect and query the collection.`,
  },
];

/**
 * Registers all MongoDB prompts to the MCP server.
 *
 * @param server The MCP server instance
 * @param logger Logger instance for logging messages and errors
 */
export function registerPrompts(server: McpServer, logger: Logger) {
  for (const def of PROMPT_DEFS) {
    server.registerPrompt(
      def.name,
      {
        description: def.description,
        argsSchema: def.schema.shape,
      },
      (args: Record<string, string | undefined>) => {
        logger.info(`Prompt received: ${JSON.stringify(args)}`);
        const resolved: Record<string, string | undefined> = {
          days: '7',
          ...args,
        };
        const filledPrompt = def.template.replace(
          /\{\{(\w+)\}\}/g,
          (match: string, key: string) =>
            resolved[key] != null ? String(resolved[key]) : match,
        );
        return formatMessageResponse(filledPrompt);
      },
    );
  }
}
