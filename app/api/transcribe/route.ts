import { NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/actions/audio';

// POST /api/transcribe — convert audio to text (Whisper)
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const text = await transcribeAudio(formData);
    return NextResponse.json({ text });
  } catch (error: unknown) {
    console.error('Error transcribing:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Transcription failed' },
      { status: 500 }
    );
  }
}
