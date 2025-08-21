import { PromptTemplate } from './types';

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    name: 'analyse-collection',
    description: 'Analyse a MongoDB collection structure and provide insights',
    arguments: [
      {
        name: 'collection',
        description: 'Name of the collection to analyse',
        required: true,
      },
    ],
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
    arguments: [
      {
        name: 'collection',
        description: 'Name of the collection to query',
        required: true,
      },
      {
        name: 'goal',
        description: 'What you want to achieve with the query',
        required: true,
      },
    ],
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
    arguments: [
      {
        name: 'collection',
        description: 'Name of the collection to explore',
        required: true,
      },
    ],
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
    arguments: [
      {
        name: 'collection',
        description: 'Name of the collection to review',
        required: true,
      },
    ],
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
    arguments: [
      {
        name: 'collection',
        description: 'Name of the collection to search',
        required: true,
      },
      {
        name: 'days',
        description: 'Number of days to look back (default: 7)',
        required: false,
      },
    ],
    template: `Find documents in the "{{collection}}" collection from the last {{days}} days.

      First examine the collection to identify date fields, then query for recent documents.
      If no date field is obvious, show the most recently added documents based on _id.

      Use the available MongoDB tools to inspect and query the collection.`,
  },
];
