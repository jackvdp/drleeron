import { openai } from './openai';

// ─── Transcribe audio to text (Whisper) ──────────────────────────────────────
export async function transcribeAudio(formData: FormData): Promise<string> {
  const audio = formData.get('audio') as File;
  if (!audio) {
    throw new Error('No audio file provided');
  }

  const transcription = await openai.audio.transcriptions.create({
    file: audio,
    model: 'whisper-1',
  });

  return transcription.text;
}

// ─── Text to speech (returns raw PCM stream) ────────────────────────────────
// Note: Returns a ReadableStream, not a plain object — must be used via API route
export async function textToSpeech(text: string): Promise<ReadableStream<Uint8Array>> {
  if (!text) {
    throw new Error('No text provided');
  }

  const response = await openai.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: 'coral',
    input: text,
    response_format: 'pcm',
  });

  return response.body as unknown as ReadableStream<Uint8Array>;
}
