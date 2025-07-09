import { PromptTemplate } from './types';

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    name: 'findRecentUsers',
    description: 'Template to find users registered in the last N days',
    arguments: [
    ],
    template: `
      You are a MongoDB query generator.
      Collection: {{collectionName}}
      Fields:
      {{fieldsList}}

      Write a query that returns all documents where {{dateField}} is within the last {{days}} days.
    `,
  },
  {
    name: 'summariseCollection',
    description: 'Prompt to summarize a collection schema',
    arguments: [
    ],
    template: `
      You are a MongoDB assistant.
      Schema for {{collectionName}}:
      {{schema}}

      Provide a concise summary of this collection's purpose and its most important fields.
    `,
  },
  {
    name: 'analyseCollection',
    description: 'Analyse a MongoDB collection structure and contents',
    arguments: [
      {
        name: 'collection',
        description: 'Name of the collection to analyze',
        required: true,
      },
    ],
    template: `
      You are a MongoDB assistant.
      Analyse the collection "{{collection}}" and report on its schema, indexes, 
      and sample documents.
    `
  },
];
