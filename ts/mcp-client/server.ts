import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { ChatOpenAI } from '@langchain/openai';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage } from '@langchain/core/messages';

// Load environment variables from .env file
dotenv.config();

// Express setup
const app = express();
app.use(express.json());

// Create client and connect to server
const client = new MultiServerMCPClient({
  // Global tool configuration options
  // Whether to throw on errors if a tool fails to load (optional, default: true)
  throwOnLoadError: true,
  // Whether to prefix tool names with the server name (optional, default: true)
  prefixToolNameWithServerName: true,
  // Optional additional prefix for tool names (optional, default: 'mcp')
  additionalToolNamePrefix: 'mcp',

  // Use standardized content block format in tool outputs
  useStandardContentBlocks: true,

  // Server configuration
  mcpServers: {
    filesystem: {
      command: 'mcp-server-filesystem',
      args: ['.'],
    },
    mongodb: {
      command: 'pnpx',
      args: ['-y', 'mongodb-mcp-server', '--readOnly'],
      env: {
        MDB_MCP_CONNECTION_STRING: process.env.MONGODB_URL!
      }
    },
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

// Chat with agent
app.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    const tools = await client.getTools();

    // console.log('Available tools', tools)

    // Free models did not work well. Uisng Open AI model
    const model = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o',
      temperature: 0,
    });

    // Create the React agent
    const agent = createReactAgent({
      llm: model,
      tools,
    });

    const result = await agent.invoke({
      messages: [new HumanMessage(message)],
    });
    // Get just the text content
    res.send(result.messages[result.messages.length - 1].content);
  } catch (error) {
    console.error('Chat error:', error instanceof Error ? error.message : error, (error as any).cause ?? '');
    res.status(400).json({ error: error instanceof Error ? { name: error.name, message: error.message, serverName: (error as any).serverName } : String(error) });
  }
});

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Express server listening on port ${PORT}`);
});
