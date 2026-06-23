// For Docker/self-hosted, uncomment ChromaClient below and import CloudClient instead.
import { CloudClient, ChromaClient } from 'chromadb';
import { OpenAIEmbeddingFunction } from '@chroma-core/openai';
import { ChatOpenAI } from '@langchain/openai';
import { RunnableSequence } from '@langchain/core/runnables';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import express, { Request, Response } from 'express';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Chroma Cloud client. Requires CHROMA_API_KEY, CHROMA_TENANT, and CHROMA_DATABASE.
const client = new CloudClient({
  apiKey: process.env.CHROMA_API_KEY,
  tenant: process.env.CHROMA_TENANT,
  database: process.env.CHROMA_DATABASE,
});

// Docker/self-hosted Chroma client. Uncomment this block and comment out CloudClient above
// when running Chroma with docker-compose.yml.
// const client = new ChromaClient({
//   // Use hostname/IP only. Do not include http:// and keep the port separate.
//   host: process.env.CHROMA_HOST || 'localhost',
//   port: Number(process.env.CHROMA_PORT || 8000),
//   ssl: false,
//   tenant: process.env.CHROMA_TENANT || 'default_tenant',
//   database: process.env.CHROMA_DATABASE || 'default_database',
// });

// Create OpenAI embedding function
const embedder = new OpenAIEmbeddingFunction({
  apiKey: process.env.OPENAI_API_KEY || '',
  modelName: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
});

// In-memory chat history store: sessionId -> messages
const chatHistories = new Map<string, (HumanMessage | AIMessage)[]>();

function getChatHistory(sessionId: string): (HumanMessage | AIMessage)[] {
  if (!chatHistories.has(sessionId)) {
    chatHistories.set(sessionId, []);
  }
  return chatHistories.get(sessionId)!;
}

// Express setup
const app = express();
app.use(express.json());


// Health check API
app.get('/health', async (req: Request, res: Response) => {
  try {
    const heartbeat = await client.heartbeat();
    res.json({
      status: 'healthy',
      chroma: heartbeat > 0 ? 'connected' : 'not connected',
    });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error });
  }
});

// Create a new collection
app.post('/collections', async (req: Request, res: Response) => {
  try {
    const { name, metadata } = req.body;
    const collection = await client.createCollection({
      name,
      embeddingFunction: embedder,
      metadata,
    });
    res.status(201).json({ message: `Collection ${collection.name} created` });
  } catch (error) {
    console.error('Error on create collection', error);
    res.status(400).json({ error });
  }
});

// Insert data into the collection
app.post('/collections/:collectionName/add', async (req: Request, res: Response) => {
  try {
    const collectionName = String(req.params.collectionName);
    const { documents } = req.body;
    const collection = await client.getCollection({ name: collectionName });

    for (const document of documents) {
      const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      await collection.add({
        ids: [uniqueId],
        documents: [document.document],
        metadatas: [document.metadata],
      });
    }

    res.status(201).json({ message: `Documents inserted into collection ${collectionName}` });
  } catch (error) {
    console.log('error', error);
    res.status(400).json({ error });
  }
});

// Query the collection
app.post('/collections/:collectionName/query', async (req: Request, res: Response) => {
  try {
    const collectionName = String(req.params.collectionName);
    const { query } = req.body;

    const collection = await client.getCollection({ name: collectionName });

    const result = await collection.query({
      queryTexts: [query],
      nResults: 1,
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ error });
  }
});

// Chat with RAG (streaming SSE + in-memory chat history)
app.post('/chat', async (req: Request, res: Response) => {
  try {
    const { query, sessionId = 'default', collectionName = 'test_collection', nResults = 5 } = req.body;

    // 1. Retrieve relevant documents from ChromaDB
    const collection = await client.getCollection({ name: collectionName });
    const results = await collection.query({
      queryTexts: [query],
      nResults,
    });

    const context = results.documents[0]
      ?.map((doc, i) => `Document ${i + 1}:\n${doc}`)
      .join('\n\n') || '';

    // 2. Build prompt with chat history and retrieved context
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', `Answer the user's questions based only on the following context.
If the answer is not in the context, reply politely that you do not have that information.
Do not mention that you retrieved data from context.
===================
Context: {context}
===================`],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
    ]);

    const model = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      model: process.env.LLM_MODEL || 'gpt-4o',
      temperature: 0.7,
    });

    const chain = RunnableSequence.from([
      {
        input: () => query,
        context: () => context,
        chat_history: () => getChatHistory(sessionId),
      },
      prompt,
      model,
      new StringOutputParser(),
    ]);

    // 3. Generate response
    const answer = await chain.invoke({});

    // 4. Save to chat history
    const history = getChatHistory(sessionId);
    history.push(new HumanMessage(query));
    history.push(new AIMessage(answer));

    res.json({ answer });
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ error: 'Failed to process chat request' });
  }
});

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Express server listening on port ${PORT}`);

  // Verify Chromadb connection on startup — heartbeat checks connectivity,
  // getUserIdentity confirms auth and shows the resolved tenant/databases.
  try {
    await client.heartbeat();
    const identity = await client.getUserIdentity();
    console.log(`ChromaDB connected (tenant: ${identity.tenant}, databases: ${identity.databases.join(', ')})`);
  } catch (error) {
    console.error('ChromaDB connection failed:', error);
    process.exit(1);
  }
});
