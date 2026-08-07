/**
 * Formats the given data into a structured response format.
 * This utility function is used to standardize the response structure
 * for tools and resources in the MCP server.
 *
 * @param data The data to be formatted into the response
 * @returns An object containing the formatted response with a content array
 *          that includes a text object.
 */
export function formatResponse(data: unknown): {
  content: [
    {
      type: 'text';
      text: string;
    },
  ];
} {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Formats the given data into a structured response format for prompts.
 * This utility function is used to standardize the response structure
 * for prompts in the MCP server.
 *
 * @param data The data to be formatted into the prompt response
 * @returns An object containing the formatted response with a messages array
 *          that includes a text object and role metadata.
 */
export function formatMessageResponse(data: string): {
  messages: Array<{
    content: {
      type: 'text';
      text: string;
    };
    role: 'assistant';
  }>;
} {
  return {
    messages: [
      {
        content: {
          type: 'text',
          text: data,
        },
        role: 'assistant',
      },
    ],
  };
}
