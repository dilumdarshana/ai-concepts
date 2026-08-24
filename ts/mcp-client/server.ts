import express, { type Request, type Response } from 'express';
import dotenv from 'dotenv';
import { ChatOpenAI } from '@langchain/openai';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { createAgent } from 'langchain';
import { HumanMessage } from '@langchain/core/messages';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

dotenv.config({ quiet: true });

const app = express();
app.use(express.json());

// The agent can't function without a model, so require this up-front and fail
// loudly rather than surfacing a confusing error on the first /chat request.
const openAiKey = process.env.OPENAI_API_KEY;
if (!openAiKey) {
  throw new Error('OPENAI_API_KEY is required. Set it in your .env file.');
}

// The chat model used by the ReAct agent. gpt-4o — one instance, reused.
const model = new ChatOpenAI({
  openAIApiKey: openAiKey,
  model: 'gpt-4o',
  temperature: 0,
});

// ---------------------------------------------------------------------------
// MCP Client
// ---------------------------------------------------------------------------

// MultiServerMCPClient connects to one or more MCP servers as subprocesses and
// exposes their tools as LangChain-compatible DynamicStructuredTool instances.
// Each entry defines a stdio subprocess (command + args) with optional env vars.
//
// The set of MCP servers to connect to. The MongoDB and currency servers need
// credentials, so they're only registered when the matching env var is present.
// This keeps the demo runnable with just the filesystem server and avoids
// spawning a subprocess that would fail during tool discovery.
const mcpServers = {
  // Filesystem server — reads/writes files in the workspace directory.
  // Binary comes from @modelcontextprotocol/server-filesystem devDependency.
  filesystem: {
    command: 'mcp-server-filesystem',
    args: ['.'],
  },

  // MongoDB server — queries MongoDB databases in read-only mode.
  // Binary comes from the mongodb-mcp-server devDependency.
  ...(process.env.MONGODB_URL
    ? {
        mongodb: {
          command: 'mongodb-mcp-server',
          args: ['--readOnly'],
          env: { MDB_MCP_CONNECTION_STRING: process.env.MONGODB_URL },
        },
      }
    : {}),

  // Currency converter — converts between currencies via FreeCurrency API.
  // Binary comes from the @alcorme/mcp-currency-converter devDependency.
  ...(process.env.FREE_CURRENCY_KEY
    ? {
        currencyConverter: {
          command: 'alcorme-mcp-server',
          args: [],
          env: {
            TRANSPORT: 'stdio',
            FREE_CURRENCY_API_KEY: process.env.FREE_CURRENCY_KEY,
          },
        },
      }
    : {}),
};

const mcpClient = new MultiServerMCPClient({
  throwOnLoadError: true,
  prefixToolNameWithServerName: true,
  additionalToolNamePrefix: 'mcp',
  useStandardContentBlocks: true,
  mcpServers,
});

// ---------------------------------------------------------------------------
// Agent (built lazily, reused across requests)
// ---------------------------------------------------------------------------

// Cached agent instance — built once on first request, reused thereafter.
// Rebuilding it per-request would re-discover MCP tools (respawning
// subprocesses) and re-create the agent on every call.
let agentInstance: Awaited<ReturnType<typeof createAgent>> | null = null;

async function getAgent() {
  if (agentInstance) return agentInstance;

  // Discover tools from every configured MCP server (spawns subprocesses on
  // first call). createAgent (from `langchain` — the non-deprecated successor
  // of createReactAgent) wires the model plus these tools into a ReAct loop.
  const tools = await mcpClient.getTools();
  agentInstance = createAgent({ model, tools });

  return agentInstance;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET / — describe the service and which MCP servers are configured.
app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'mcp-client',
    agent: 'ReAct (createAgent)',
    mcpServers: Object.keys(mcpServers),
    endpoints: { chat: 'POST /chat' },
  });
});

// POST /chat
// Accepts { message: string } and returns the agent's text response.
//
// Flow:
//   1. Build (or reuse) the ReAct agent backed by MCP-discovered tools
//   2. Invoke it with the user message
//   3. Return the agent's final response text
app.post('/chat', async (req: Request, res: Response) => {
  const { message } = req.body ?? {};

  if (typeof message !== 'string' || message.trim().length === 0) {
    res
      .status(400)
      .json({ error: 'message is required and must be a non-empty string' });
    return;
  }

  try {
    const agent = await getAgent();
    const result = await agent.invoke({
      messages: [new HumanMessage(message)],
    });

    // Last message content is the agent's final answer. Fall back to '' if the
    // content is missing or non-stringable.
    res.json({
      response: String(result.messages.at(-1)?.content ?? ''),
      steps: result.messages.length - 1,
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Server start
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`MCP client listening on port ${PORT}`);
});
