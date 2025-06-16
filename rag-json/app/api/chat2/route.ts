import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    // Extract the `messages` from the body of the request
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

    // Get the stream
    const stream = await chain.stream({ message });

    // Convert LangChain stream to AI SDK compatible format
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            // Format as AI SDK expects (data stream format)
            const formatted = `0:"${chunk.replace(/"/g, '\\"')}"\n`;
            controller.enqueue(encoder.encode(formatted));
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
