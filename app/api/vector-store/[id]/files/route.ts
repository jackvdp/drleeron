import { NextRequest, NextResponse } from 'next/server';
import { listVectorStoreFiles } from '@/lib/actions/vector-store';

// GET /api/vector-store/[id]/files — list files in a vector store
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const files = await listVectorStoreFiles(id);
    return NextResponse.json({ files });
  } catch (error: unknown) {
    console.error('Error listing files:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list files' },
      { status: 500 }
    );
  }
}
