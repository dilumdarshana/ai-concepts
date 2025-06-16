import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { OpenAIChatModelId } from '@ai-sdk/openai/internal';

// run the code v8 based edge functions like like Cloudflare Workers or Vercel Edge Functions
// this does not support in AWS Amplify
export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai(process.env.OPENAI_MODEL as OpenAIChatModelId),
    system: 'You are a helpful assistant.',
    messages,
  });

  return result.toDataStreamResponse();
}
