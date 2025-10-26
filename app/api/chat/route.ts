import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { messages, vectorStoreId } = await req.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json(
          { error: 'No messages provided' },
          { status: 400 }
      );
    }

    // Get the last user message
    const lastUserMessage = messages
        .filter((m: any) => m.role === 'user')
        .pop();

    if (!lastUserMessage) {
      return NextResponse.json(
          { error: 'No user message found' },
          { status: 400 }
      );
    }

    const userInput = lastUserMessage.parts
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join(' ');

    // Build the tools array
    const tools: any[] = [];

    if (vectorStoreId) {
      tools.push({
        type: 'file_search',
        vector_store_ids: [vectorStoreId],
      });
    }

    // Create the response with Responses API
    const response = await openai.responses.create({
      model: 'gpt-4o-2024-11-20',
      input: userInput,
      instructions: `You are Dr. Leeron, a helpful medical tutor AI assistant designed to help medical students learn complex concepts.

Your role is to:
- Break down complex medical topics into understandable explanations
- Use analogies and examples to clarify difficult concepts
- Ask clarifying questions when needed
- Provide structured, organized responses
- Reference specific information from the knowledge base when available

When using information from the knowledge base:
- Cite the source when referencing specific facts
- Be precise and accurate
- If you're not certain about something, acknowledge it

Keep your responses conversational but professional.`,
      tools: tools.length > 0 ? tools : undefined,
    });

    // Extract the text content from the response
    let assistantText = '';
    let citations: any[] = [];

    if (response.output && Array.isArray(response.output)) {
      for (const item of response.output) {
        // Check if this is a message type
        if (item.type === 'message' && 'content' in item) {
          // Iterate through the content array
          for (const contentItem of item.content) {
            if (contentItem.type === 'output_text' && 'text' in contentItem) {
              assistantText += contentItem.text;

              // Extract annotations/citations if present
              if ('annotations' in contentItem && Array.isArray(contentItem.annotations)) {
                citations.push(...contentItem.annotations);
              }
            }
          }
        }
      }
    }

    // Fallback to output_text helper if available
    if (!assistantText && 'output_text' in response) {
      assistantText = response.output_text as string;
    }

    // Create a streaming response format that matches your frontend
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Send the complete text as chunks for smooth display
        const words = assistantText.split(' ');
        let currentText = '';

        words.forEach((word, index) => {
          currentText += (index > 0 ? ' ' : '') + word;
          const data = `0:${JSON.stringify(currentText)}\n`;
          controller.enqueue(encoder.encode(data));
        });

        // If there are citations, send them as metadata
        if (citations.length > 0) {
          const citationData = `1:${JSON.stringify({ citations })}\n`;
          controller.enqueue(encoder.encode(citationData));
        }

        controller.close();
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error: any) {
    console.error('Error in chat API:', error);
    return NextResponse.json(
        { error: error.message || 'Failed to process chat' },
        { status: 500 }
    );
  }
}