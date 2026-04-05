import { NextRequest, NextResponse } from 'next/server';
import { listVectorStores, createVectorStore } from '@/lib/actions/vector-store';

// GET /api/vector-store — list all vector stores
export async function GET() {
  try {
    const stores = await listVectorStores();
    return NextResponse.json({ vectorStores: stores });
  } catch (error: unknown) {
    console.error('Error listing vector stores:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list vector stores' },
      { status: 500 }
    );
  }
}

// POST /api/vector-store — create a new vector store
export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    const store = await createVectorStore(name);
    return NextResponse.json(store);
  } catch (error: unknown) {
    console.error('Error creating vector store:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create vector store' },
      { status: 500 }
    );
  }
}
