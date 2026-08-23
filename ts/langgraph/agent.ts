import { createAgent } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { convertCurrency } from './tools/currencyTool';
import { getDatabaseSchema, queryDatabase } from './tools/databaseTool';

// GPT-4o-mini powers the agent — decides which tool to invoke based
// on the user's natural-language request.
const model = new ChatOpenAI({
  model: 'gpt-4o-mini',
});

// Configure one or more MCP servers (stdio or HTTP/SSE transports both work).
// Only the ones with a configured token/URL are added — if none, the agent
// still works with just the local tools.
const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    ...(process.env.GITHUB_AUTH_TOKEN
      ? {
          github: {
            type: 'http',
            url: 'https://api.githubcopilot.com/mcp/',
            headers: {
              Authorization: `Bearer ${process.env.GITHUB_AUTH_TOKEN}`,
            },
          },
        }
      : {}),
  },
});

// Cached agent instance — built once on first call, reused thereafter.
let agentInstance: Awaited<ReturnType<typeof createAgent>> | null = null;

export async function getAgent() {
  if (agentInstance) return agentInstance;

  // Fetch tool definitions from every configured MCP server. A failure here
  // shouldn't take down the agent, so we fall back to local tools only.
  let mcpTools: Awaited<ReturnType<typeof mcpClient.getTools>> = [];
  try {
    mcpTools = await mcpClient.getTools();
  } catch (error) {
    console.warn('MCP tool discovery failed, using local tools only:', error);
  }

  // createAgent (from `langchain`, the non-deprecated successor of
  // createReactAgent) wires the model plus available tools into a ReAct-loop
  // agent (thought → action → observation → repeat).
  agentInstance = createAgent({
    model,
    tools: [convertCurrency, getDatabaseSchema, queryDatabase, ...mcpTools],
  });

  return agentInstance;
}
