import express, { type Request, type Response } from 'express';
import dotenv from 'dotenv';
import { ChatOpenAI } from '@langchain/openai';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage } from '@langchain/core/messages';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Load environment variables from .env file (OPENAI_API_KEY, MONGODB_URL, etc.)
dotenv.config();

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// MCP Client
// ---------------------------------------------------------------------------

// MultiServerMCPClient connects to one or more MCP servers as subprocesses and
// exposes their tools as LangChain-compatible DynamicStructuredTool instances.
//
// Each server entry defines a stdio subprocess (command + args) with optional
// environment variables. The client spawns these processes, negotiates the MCP
// protocol, and collects the tools they advertise.
const client = new MultiServerMCPClient({
  // Global tool configuration
  throwOnLoadError: true,
  prefixToolNameWithServerName: true,
  additionalToolNamePrefix: 'mcp',
  useStandardContentBlocks: true,

  mcpServers: {
    // Filesystem server — reads/writes files in the workspace directory.
    // Binary comes from @modelcontextprotocol/server-filesystem devDependency.
    filesystem: {
      command: 'mcp-server-filesystem',
      args: ['.'],
    },

    // MongoDB server — queries MongoDB databases in read-only mode.
    // Uses pnpx to fetch and run mongodb-mcp-server on demand.
    // Requires MONGODB_URL in .env for the connection string.
    mongodb: {
      command: 'pnpx',
      args: ['-y', 'mongodb-mcp-server', '--readOnly'],
      env: {
        MDB_MCP_CONNECTION_STRING: process.env.MONGODB_URL!,
      },
    },

    // Currency converter — converts between currencies via FreeCurrency API.
    // Uses pnpx to fetch and run @alcorme/mcp-currency-converter on demand.
    // Requires FREE_CURRENCY_KEY in .env for the API key.
    currencyConverter: {
      command: 'pnpx',
      args: ['-y', '@alcorme/mcp-currency-converter'],
      env: {
        TRANSPORT: 'stdio',
        FREE_CURRENCY_API_KEY: process.env.FREE_CURRENCY_KEY as string,
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Chat endpoint
// ---------------------------------------------------------------------------

// POST /chat
// Accepts { message: string } and returns the agent's text response.
//
// Flow:
//   1. Collect tools from all connected MCP servers
//   2. Create a LangGraph ReAct agent with GPT-4o
//   3. Invoke the agent with the user message
//   4. Return the last message content from the agent
app.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    // Discover all MCP tools (spawns subprocesses on first call)
    const tools = await client.getTools();

    // GPT-4o with zero temperature for deterministic tool calls
    const model = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o',
      temperature: 0,
    });

    // ReAct agent: reasons, calls tools, and responds
    const agent = createReactAgent({ llm: model, tools });

    const result = await agent.invoke({
      messages: [new HumanMessage(message)],
    });

    // Return the agent's final response text
    res.send(result.messages[result.messages.length - 1].content);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(400).json({
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, serverName: (error as any).serverName }
          : String(error),
    });
  }
});

// ---------------------------------------------------------------------------
// Server start
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`);
});
