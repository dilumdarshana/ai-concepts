import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { HumanMessage } from '@langchain/core/messages';
import { agent } from './agent';

// Load environment variables from .env file
dotenv.config();

// Express setup
const app = express();
app.use(express.json());

app.post('/agent', async (req: Request, res: Response) => {
  const { message } = req.body;

  try {
    const result = await agent.invoke({
      messages: [new HumanMessage(message)],
    });

    res.send(result.messages[result.messages.length - 1].content);
  } catch (error) {
    console.error('Error on agent', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Express server listening on port ${PORT}`);
});
