import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import type { UIMessage, TextUIPart, UIMessageChunk } from 'ai';
import { createUIMessageStreamResponse } from 'ai';

export const dynamic = 'force-dynamic';

const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are the movie expert. All responses must be in the form of a movie review.'],
  new MessagesPlaceholder('chat_history'),
  ['human', '{message}'],
]);

function toLangChainMessages(msgs: UIMessage[]) {
  return msgs.map(m => {
    const text = m.parts.filter((p): p is TextUIPart => p.type === 'text').map(p => p.text).join('');
    return m.role === 'user' ? new HumanMessage(text) : new AIMessage(text);
  });
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const last = messages.at(-1);
    const message = last.parts.filter((p: TextUIPart) => p.type === 'text').map((p: TextUIPart) => p.text).join('');
    const chatHistory = toLangChainMessages(messages.slice(0, -1));

    const model = new ChatOpenAI({
      streaming: true,
      apiKey: process.env.OPENAI_API_KEY!,
      model: process.env.OPENAI_MODEL!,
      temperature: 0.8,
      verbose: true,
    });

    const parser = new StringOutputParser();
    const chain = prompt.pipe(model).pipe(parser);

    const stream = await chain.stream({
      message,
      chat_history: chatHistory,
    });

    const id = crypto.randomUUID();

    const chunkStream = new ReadableStream<UIMessageChunk>({
      async start(controller) {
        controller.enqueue({ type: 'text-start', id });

        for await (const chunk of stream) {
          if (chunk) {
            controller.enqueue({ type: 'text-delta', id, delta: chunk });
          }
        }

        controller.enqueue({ type: 'text-end', id });
        controller.close();
      },
    });

    return createUIMessageStreamResponse({ stream: chunkStream });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
