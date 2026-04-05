import { NextResponse } from 'next/server';
import { createRealtimeSession } from '@/lib/actions/realtime';

// POST /api/realtime — create an ephemeral session token
export async function POST() {
  try {
    const session = await createRealtimeSession();
    return NextResponse.json(session);
  } catch (err) {
    console.error('Error creating realtime session:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
