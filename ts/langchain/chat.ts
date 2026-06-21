// Import necessary modules and libraries
import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { ChatOpenAI } from '@langchain/openai';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { z } from 'zod';

// Load environment variables from a .env file
dotenv.config();

const schema = z.object({
  answer: z.string(),
  confidence: z.number(),
});

// Initialize an Express application
const app = express();
app.use(express.json()); // Middleware to parse JSON request bodies

// Configure the OpenAI model with API key and settings
const model = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY, // API key for OpenAI
  model: 'gpt-4o', // Model name
  temperature: 0.7, // Temperature setting for response variability
}).withStructuredOutput(schema);

// Store chat histories for different sessions
const histories: Record<string, InMemoryChatMessageHistory> = {};

// Define a prompt template for the AI model
const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are an assistant who good at {skill}'], // System message template
  new MessagesPlaceholder('history'), // Placeholder for chat history
  ['user', '{message}'], // User message template
]);

// Create a processing chain with the prompt and model
const chain = prompt.pipe(model);

const chainWithHistory = new RunnableWithMessageHistory({
  runnable: chain,
  getMessageHistory: (sessionId: string) => {
    if (!histories[sessionId]) {
      histories[sessionId] = new InMemoryChatMessageHistory();
    }
    return histories[sessionId];
  },
  inputMessagesKey: 'message',
  historyMessagesKey: 'history',
  outputMessagesKey: 'answer',
});

// Define a POST endpoint for chat interactions
app.post('/chat', async (req: Request, res: Response): Promise<any> => {
  const { message, skill = 'nodejs' } = req.body; // Extract message and skill from request body
  if (!message) {
    return res.status(400).json({ error: 'Message is required' }); // Return error if message is missing
  }

  try {
    // Invoke the AI chain with the provided message and skill
    const aiResponse = await chainWithHistory.invoke(
      {
        skill,
        message,
      },
      {
        configurable: {
          sessionId: 'assistant', // Use a fixed session ID for simplicity
        }
      }
    );

    res.json({ response: aiResponse }); // Send AI response back to the client
  } catch (error) {
    res.status(500).json({ error: 'AI service error', details: error }); // Handle errors
  }
});

// Start the server on the specified port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI chat backend running on port ${PORT}`); // Log server start
});
