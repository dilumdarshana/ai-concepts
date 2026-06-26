// chat4 — LangChain RAG: loads movie.json as context, injects it into the
// prompt via RunnableSequence, and streams the response in AI SDK v6 SSE
// format so useChat (DefaultChatTransport) can consume it natively.

import { ChatOpenAI } from '@langchain/openai';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import type { UIMessage, TextUIPart, UIMessageChunk } from 'ai';
import { createUIMessageStreamResponse } from 'ai';

import { JSONLoader } from 'langchain/document_loaders/fs/json';
import { RunnableSequence } from '@langchain/core/runnables';
import { formatDocumentsAsString } from 'langchain/util/document';

export const dynamic = 'force-dynamic';

const loader = new JSONLoader('data/movie.json', [
  '/title',
  '/genre',
  '/actors',
  '/year',
]);

// ChatPromptTemplate with MessagesPlaceholder sends prior messages with
// proper role boundaries (human/assistant) instead of raw text, preventing
// the model from treating the full history as one continuous narrative.
// The system message includes the JSON context for RAG.
const prompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `Answer the user's questions based only on the following context.
If the answer is not in the context, reply politely that you do not have that information.
Do not mention that you retrieve data from context.
===================
Context: {context}
===================`,
  ],
  new MessagesPlaceholder('chat_history'),
  ['human', '{message}'],
]);

function toLangChainMessages(msgs: UIMessage[]) {
  return msgs.map((m) => {
    // AI SDK v6 UIMessage uses .parts (not .content) — extract text from
    // the TextUIPart entries.
    const text = m.parts
      .filter((p): p is TextUIPart => p.type === 'text')
      .map((p) => p.text)
      .join('');
    return m.role === 'user' ? new HumanMessage(text) : new AIMessage(text);
  });
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    // Last message is the current user prompt; everything before is history.
    const last = messages.at(-1);
    const message = last.parts
      .filter((p: TextUIPart) => p.type === 'text')
      .map((p: TextUIPart) => p.text)
      .join('');
    const chatHistory = toLangChainMessages(messages.slice(0, -1));

    const docs = await loader.load();

    const model = new ChatOpenAI({
      streaming: true,
      apiKey: process.env.OPENAI_API_KEY!,
      model: process.env.OPENAI_MODEL!,
      temperature: 0.5,
      verbose: true,
    });

    const parser = new StringOutputParser();
    // RunnableSequence injects the static context alongside per-request
    // message and chat_history into the prompt template.
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

    const stream = await chain.stream({
      message,
      chat_history: chatHistory,
    });

    // Each text block needs a unique id — used by the client to reconcile
    // text-start, text-delta, and text-end events into a single message part.
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

    // createUIMessageStreamResponse wraps the chunk stream in SSE format
    // (text/event-stream) and sets the x-vercel-ai-ui-message-stream header
    // that DefaultChatTransport.processResponseStream expects.
    return createUIMessageStreamResponse({ stream: chunkStream });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
