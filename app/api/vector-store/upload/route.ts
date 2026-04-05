import { NextRequest, NextResponse } from 'next/server';
import { uploadToVectorStore } from '@/lib/actions/vector-store';

// POST /api/vector-store/upload — upload files to a vector store
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const result = await uploadToVectorStore(formData);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error uploading files:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload files' },
      { status: 500 }
    );
  }
}
