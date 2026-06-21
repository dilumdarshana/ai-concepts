// LangChain — demonstrates streaming with ChatOpenAI + StringOutputParser,
// then converts the text stream into the AI SDK v6 SSE format so useChat
// (DefaultChatTransport) can consume it natively.

import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { createUIMessageStreamResponse } from 'ai';
import type { UIMessageChunk } from 'ai';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const message = messages.at(-1).content;

    const prompt = PromptTemplate.fromTemplate("{message}");

    const model = new ChatOpenAI({
      streaming: true,
      apiKey: process.env.OPENAI_API_KEY!,
      model: process.env.OPENAI_MODEL!,
      temperature: 0.8,
    });

    const parser = new StringOutputParser();
    const chain = prompt.pipe(model).pipe(parser);
    const stream = await chain.stream({ message });

    // Each text block needs a unique id — used by the client to reconcile
    // text-start, text-delta, and text-end events into a single message part.
    const id = crypto.randomUUID();

    const chunkStream = new ReadableStream<UIMessageChunk>({
      async start(controller) {
        // Signal the beginning of a new text part
        controller.enqueue({ type: 'text-start', id });

        // Forward each LangChain token as a text-delta chunk
        for await (const chunk of stream) {
          controller.enqueue({ type: 'text-delta', id, delta: chunk });
        }

        // Signal the end of this text part
        controller.enqueue({ type: 'text-end', id });
        controller.close();
      },
    });

    // createUIMessageStreamResponse wraps the chunk stream in SSE format
    // (text/event-stream) and sets the x-vercel-ai-ui-message-stream header
    // that DefaultChatTransport.processResponseStream expects.
    return createUIMessageStreamResponse({ stream: chunkStream });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
