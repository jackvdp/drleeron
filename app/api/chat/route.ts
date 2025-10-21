import { openai } from '@ai-sdk/openai';
import { streamText, convertToModelMessages } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();
  
  // Convert UIMessages (with parts) to ModelMessages (with content)
  const modelMessages = convertToModelMessages(messages);
  
  const result = streamText({
    model: openai('gpt-4'),
    messages: modelMessages,
  });

  return result.toUIMessageStreamResponse();
}
