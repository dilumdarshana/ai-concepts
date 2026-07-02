import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { convertCurrency } from './tools/currencyTool';
import { getDatabaseSchema, queryDatabase } from './tools/databaseTool';

// GPT-4o-mini powers the agent — decides which tool to invoke based
// on the user's natural-language request.
const model = new ChatOpenAI({
  model: 'gpt-4o-mini',
});

// Configure one or more MCP servers (stdio or HTTP/SSE transports both work)
const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    github: {
      type: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_AUTH_TOKEN}`
      }
    },
  },
});

let agentInstance: Awaited<ReturnType<typeof createReactAgent>> | null = null;

export async function getAgent() {
  if (agentInstance) return agentInstance;

  const mcpTools = await mcpClient.getTools();

  // createReactAgent wires the LLM plus available tools into a
  // ReAct-loop agent (thought → action → observation → repeat).
  agentInstance = createReactAgent({
    llm: model,
    tools: [convertCurrency, getDatabaseSchema, queryDatabase, ...mcpTools],
  });

  return agentInstance;
}
