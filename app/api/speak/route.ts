import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const { text } = await req.json();

  const response = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "coral",
    input: text,
    response_format: "pcm", // Raw PCM for lowest latency
  });

  // Stream the response body directly
  return new Response(response.body, {
    headers: {
      'Content-Type': 'audio/pcm',
      'Transfer-Encoding': 'chunked',
    },
  });
}
