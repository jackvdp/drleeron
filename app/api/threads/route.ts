import { NextRequest } from 'next/server';
import { listMessages, deleteThread } from '@/lib/assistant';

// GET /api/threads?threadId=xxx - List messages in a thread
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const threadId = searchParams.get('threadId');

  if (!threadId) {
    return new Response(JSON.stringify({ error: 'threadId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const messages = await listMessages(threadId);
    
    // Transform to our message format
    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      parts: msg.content
        .filter((c) => c.type === 'text')
        .map((c) => ({
          type: 'text' as const,
          text: c.type === 'text' ? c.text.value : '',
        })),
      createdAt: msg.created_at,
    }));

    return new Response(JSON.stringify({ messages: formattedMessages }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching thread messages:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch messages',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// DELETE /api/threads?threadId=xxx - Delete a thread
export async function DELETE(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const threadId = searchParams.get('threadId');

  if (!threadId) {
    return new Response(JSON.stringify({ error: 'threadId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await deleteThread(threadId);
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error deleting thread:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to delete thread',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
