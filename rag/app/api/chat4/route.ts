import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { Message as VercelChatMessage } from 'ai';

import { JSONLoader } from 'langchain/document_loaders/fs/json';
// import { CharacterTextSplitter } from 'langchain/text_splitter';
import { RunnableSequence } from '@langchain/core/runnables';
import { formatDocumentsAsString } from 'langchain/util/document';

export const dynamic = 'force-dynamic';

const loader = new JSONLoader(
  'data/movie.json',
  ['/title', '/genre', '/actors', '/year'],
);

const formatMessage = (message: VercelChatMessage) => {
  return `${message.role}: ${message.content}`;
};

const messageTemplate = `
  Answer the user's questions based only on the following context.
  If the answer is not in the context, reply politely that you do not have that information.
  Do not mension that you retrieve data from context
  ===================
  Context: {context}
  ===================
 
  Current conversation: {chat_history}

  user: {message}

  assistant:
`;

export async function POST(req: Request) {
  try {
    // Extract the `messages` from the body of the request
    const { messages } = await req.json();

    const message = messages.at(-1).content;
    const chatHistory = messages.slice(0, -1).map(formatMessage).join('\n');

    // Load the document
    const docs = await loader.load();

    // Load JSON Object for testing
    // const textSplitter = new CharacterTextSplitter();
    // const docs = await textSplitter.createDocuments([
    //   JSON.stringify({
    //     title: 'Crazy AI',
    //     actors: ['Dilum', 'Nimal', 'Kamal'],
    //     year: 2025,
    //   })
    // ]);

    const prompt = PromptTemplate.fromTemplate(messageTemplate);

    const model = new ChatOpenAI({
      streaming: true,
      apiKey: process.env.OPENAI_API_KEY!,
      model: process.env.OPENAI_MODEL!,
      temperature: 0.5,
      verbose: true,
    });

    const parser = new StringOutputParser();
    const chain = RunnableSequence.from([
      {
        message: (input) => input.message,
        chat_history: (input) => input.chat_history,
        context: () => formatDocumentsAsString(docs),
      },
      prompt,
      model,
      parser,
    ]);

    // Get the stream
    const stream = await chain.stream({
      message,
      chat_history: chatHistory,
    });

    // Convert LangChain stream to AI SDK compatible format
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk) {
              // Format as AI SDK expects - escape quotes and newlines
              const escapedChunk = chunk
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r');

              // Format as AI SDK expects (data stream format)
              const formatted = `0:"${escapedChunk}"\n`;
              controller.enqueue(encoder.encode(formatted));
            }
          }
          // End the stream
          controller.enqueue(encoder.encode('d:\n'));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        //'X-Vercel-AI-Data-Stream': 'v1',
      },
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
