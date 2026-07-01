import express, { type Request, type Response } from 'express';
import dotenv from 'dotenv';
import { ChatOpenAI } from '@langchain/openai';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage } from '@langchain/core/messages';

dotenv.config();

const app = express();
app.use(express.json());

const client = new MultiServerMCPClient({
  throwOnLoadError: true,
  prefixToolNameWithServerName: true,
  additionalToolNamePrefix: 'mcp',
  useStandardContentBlocks: true,

  mcpServers: {
    filesystem: {
      command: 'mcp-server-filesystem',
      args: ['.'],
    },
    mongodb: {
      command: 'pnpx',
      args: ['-y', 'mongodb-mcp-server', '--readOnly'],
      env: {
        MDB_MCP_CONNECTION_STRING: process.env.MONGODB_URL!,
      },
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

app.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    const tools = await client.getTools();
    const model = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o',
      temperature: 0,
    });
    const agent = createReactAgent({ llm: model, tools });
    const result = await agent.invoke({
      messages: [new HumanMessage(message)],
    });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`);
});
