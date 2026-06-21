import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { UIMessage as VercelChatMessage } from 'ai';

export const dynamic = 'force-dynamic';

const formatMessage = (message: VercelChatMessage) => {
  const text = message.parts.filter(p => p.type === 'text').map(p => p.text).join('');
  return `${message.role}: ${text}`
};

const messageTemplate = `
  You are the movie expert. All responses must be in the form of a movie review.

  Current conversation:
  {chat_history}

  user: {message}

  assistant:
`;

export async function POST(req: Request) {
  try {
    // Extract the `messages` from the body of the request
    const { messages } = await req.json();

    const message = messages.at(-1).content;
    const chatHistory = messages.slice(0, -1).map(formatMessage).join('\n');

    const prompt = PromptTemplate.fromTemplate(messageTemplate);

    const model = new ChatOpenAI({
      // streaming: true,
      apiKey: process.env.OPENAI_API_KEY!,
      model: process.env.OPENAI_MODEL!,
      temperature: 0.8,
      verbose: true,
    });

    const parser = new StringOutputParser();
    const chain = prompt.pipe(model).pipe(parser);

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
