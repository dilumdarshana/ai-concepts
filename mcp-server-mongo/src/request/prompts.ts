import type {
  ListPromptsRequest,
  GetPromptRequest,
} from '@modelcontextprotocol/sdk/types.js';
import type { Db, MongoClient } from 'mongodb';
import { PROMPT_TEMPLATES } from '../shared/prompts.js';

export async function handleListPromptsRequest({
  request,
  dbClient,
  db,
  readOnly,
}: {
  request: ListPromptsRequest;
  dbClient: MongoClient;
  db: Db;
  readOnly: boolean;
}) {
  // Map each template to the shape MCP expects
  const prompts = PROMPT_TEMPLATES.map(({ name, description, arguments: args }) => ({
    name,
    description,
    arguments: args,
  }));

  return { prompts };
}


export async function handleGetPromptRequest({
  request,
  dbClient,
  db,
  readOnly,
}: {
  request: GetPromptRequest;
  dbClient: MongoClient;
  db: Db;
  readOnly: boolean;
}) {
  const { name, arguments: args = {} } = request.params;
  const found = PROMPT_TEMPLATES.find((p) => p.name === name);

  if (!found) {
    throw new Error(`Prompt '${name}' not found`);
  }

  const collectionName = args.collection;

  const template = found.template;
  const values = { collection: collectionName };

  // Simple Mustache‑lite substitution:
  const filledPrompt = template.replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => {
      const v = (values as any)[key];
      // if (v == null) throw new Error(`Missing prompt argument: ${key}`);
      return String(v);
    }
  );

  return {
    description: found.description,
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: filledPrompt,
      },
    }]
  };
}
