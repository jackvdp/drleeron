import { NextRequest } from 'next/server';
import { streamChat } from '@/lib/actions/chat';

// POST /api/chat — streaming text chat with optional knowledge base search
export async function POST(req: NextRequest) {
  try {
    const { messages, vectorStoreId } = await req.json();

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'No messages provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const lastUserMessage = messages
      .filter((m: { role: string }) => m.role === 'user')
      .pop();

    if (!lastUserMessage) {
      return new Response(JSON.stringify({ error: 'No user message found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userInput = lastUserMessage.parts
      .filter((p: { type: string; text?: string }) => p.type === 'text')
      .map((p: { type: string; text?: string }) => p.text)
      .join(' ');

    const stream = await streamChat(userInput, vectorStoreId);

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          let accumulatedText = '';

          for await (const event of stream) {
            if (event.type === 'response.output_text.delta') {
              accumulatedText += event.delta;
              controller.enqueue(encoder.encode(`0:${JSON.stringify(accumulatedText)}\n`));
            }

            if (event.type === 'error') {
              console.error('Stream error:', event);
              throw new Error('Stream error occurred');
            }
          }

          controller.close();
        } catch (error) {
          console.error('Error in stream:', error);
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error: unknown) {
    console.error('Error in chat API:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to process chat' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
