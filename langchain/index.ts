import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { ChatOpenAI } from '@langchain/openai';

dotenv.config();

const app = express();
app.use(express.json());

const model = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o',
  temperature: 0.7,
});

app.post('/chat', async (req: Request, res: Response): Promise<any> => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  try {
    const aiResponse = await model.invoke(message);

    // Get just the text content
    const responseText = aiResponse.content;

    res.json({ response: responseText });
  } catch (error) {
    res.status(500).json({ error: 'AI service error', details: error });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI chat backend running on port ${PORT}`);
});
