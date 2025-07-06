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
    // filesystem: {
    //   transport: 'stdio',
    //   command: 'pnpx',
    //   args: ['@modelcontextprotocol/server-filesystem', './'],
    // },
    // mongodb: {
    //   command: 'pnpx',
    //   args: ['mcp-mongo-server'],
    //   env: {
    //     MCP_MONGODB_URI: process.env.MONGODB_URL as string,
    //     MCP_MONGODB_READONLY: 'true'
    //   }
    // },
    // mongodb: {
    //   // command: 'pnpx',
    //   command: 'mcp-server-mongo',
    //   args: ['mcp-server-mongo'],
    //   env: {
    //     MCP_MONGODB_URI: process.env.MONGODB_URL as string,
    //     MCP_MONGODB_READONLY: 'true'
    //   }
    // },
    currencyConverter: {
      command: 'mcp-currency-converter',
      args: [],
      env: {
        FREE_CURRENCY_KEY: process.env.FREE_CURRENCY_KEY as string,
      },
    },
  }
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
      messages: [
        new HumanMessage(message)
      ],
    });
    // Get just the text content
    res.send(result.messages[result.messages.length - 1].content);
  } catch (error) {
    console.log('Error', error);
    res.status(400).json({ error });
  }
});

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Express server listening on port ${PORT}`);
});
