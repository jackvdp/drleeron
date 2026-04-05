import { NextRequest, NextResponse } from 'next/server';
import { searchKnowledgeBase } from '@/lib/actions/realtime';

// POST /api/realtime/search — query the vector store
export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();
    const result = await searchKnowledgeBase(query);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Search error:', err);
    return NextResponse.json(
      { success: false, error: 'Search failed', results: [], message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
