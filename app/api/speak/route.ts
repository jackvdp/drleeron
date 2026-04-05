import { textToSpeech } from '@/lib/actions/audio';

// POST /api/speak — convert text to speech (returns PCM audio stream)
export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    const audioStream = await textToSpeech(text);

    return new Response(audioStream, {
      headers: {
        'Content-Type': 'audio/pcm',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error: unknown) {
    console.error('Error in TTS:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'TTS failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
