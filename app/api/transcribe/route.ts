import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const formData = await req.formData();
  const audio = formData.get('audio') as File;
  
  const transcription = await openai.audio.transcriptions.create({
    file: audio,
    model: 'whisper-1',
  });

  return Response.json({ text: transcription.text });
}
