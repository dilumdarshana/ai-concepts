import 'dotenv/config';
import { VoltAgent, VoltOpsClient, Agent } from '@voltagent/core';
import { createPinoLogger } from '@voltagent/logger';
import { VercelAIProvider } from '@voltagent/vercel-ai';
import { openai } from '@ai-sdk/openai';
import express, { Request, Response } from 'express';
import { expenseApprovalWorkflow } from './workflows';
import { convertCurrencyTool, weatherTool } from './tools';

// Express setup
const app = express();
app.use(express.json());

// Create a logger instance
const logger = createPinoLogger({
  name: 'voltagent',
  level: 'info',
});

const agent = new Agent({
  name: 'voltagent',
  instructions: 'The helpful assistant that can check weather and help with various tasks',
  llm: new VercelAIProvider(),
  model: openai('gpt-4o-mini'),
  tools: [weatherTool, convertCurrencyTool],
  workflows: { expenseApprovalWorkflow },
  logger,
});

const voltAgent = new VoltAgent({
  agents: {
    chatAgnet: agent,
  },
  logger,
  // voltOpsClient: new VoltOpsClient({
  //   publicKey: process.env.VOLTAGENT_PUBLIC_KEY || '',
  //   secretKey: process.env.VOLTAGENT_SECRET_KEY || '',
  // }),
});
// const voltAgent = new VoltAgent({
//   agents: {
//     agent,
//   },
//   workflows: {
//     expenseApprovalWorkflow,
//   },
//   logger,
//   voltOpsClient: new VoltOpsClient({
//     publicKey: process.env.VOLTAGENT_PUBLIC_KEY || '',
//     secretKey: process.env.VOLTAGENT_SECRET_KEY || '',
//   }),
// });


app.post('/chat', async (req, res) => {
  const { message } = req.body;
  const response = await agent.generateText(message);

  res.json(response.text);
});

app.post('/workflow', async (req, res) => {
  const response = await agent.workflows.expenseApprovalWorkflow.start(req.body);

  res.json(response);
});


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
  console.log(`Chat endpoint: http://localhost:${PORT}/chat`);
});
