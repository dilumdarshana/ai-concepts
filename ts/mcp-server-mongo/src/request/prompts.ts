import type {
  ListPromptsRequest,
  GetPromptRequest,
} from '@modelcontextprotocol/sdk/types.js';
import type { Db, MongoClient } from 'mongodb';
import { PROMPT_TEMPLATES } from '../shared/prompts.js';

export async function handleListPromptsRequest() {
  // Map each template to the shape MCP expects
  return {
    prompts: PROMPT_TEMPLATES.map(({ name, description, arguments: args }) => ({
      name,
      description,
      arguments: args,
    })),
  };
}

// Updated handleGetPromptRequest function with dynamic argument resolution
export async function handleGetPromptRequest({
  request,
}: {
  request: GetPromptRequest;
}) {
  const { name, arguments: args = {} } = request.params;
  // Find the template
  const found = PROMPT_TEMPLATES.find((p) => p.name === name);

  if (!found) {
    throw new Error(`Prompt '${name}' not found`);
  }

  // Validate required arguments
  const missingArgs = found.arguments
    .filter((arg) => arg.required && !(arg.name in args))
    .map((arg) => arg.name);

  if (missingArgs.length > 0) {
    throw new Error(`Missing required arguments: ${missingArgs.join(', ')}`);
  }

  // Set default values for optional arguments
  const resolvedArgs = { ...args };
  if (name === 'find-recent' && !resolvedArgs.days) {
    resolvedArgs.days = '7';
  }

  // Simple substitution - no complex database queries needed
  const filledPrompt = found.template.replace(
    /\{\{(\w+)\}\}/g,
    (match, key) => {
      const value = resolvedArgs[key];
      if (value == null) {
        console.warn(`Missing prompt argument: ${key} in template ${name}`);
        return match;
      }
      return String(value);
    },
  );

  return {
    description: found.description,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: filledPrompt,
        },
      },
    ],
  };
}
