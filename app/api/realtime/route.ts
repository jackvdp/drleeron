import { NextResponse } from 'next/server';

// POST /api/realtime — create an ephemeral session token for client-side Realtime API
export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'coral',
        modalities: ['text', 'audio'],
        instructions: getSystemPrompt(),
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        tools: getTools(),
        tool_choice: 'auto',
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to create realtime session:', error);
      return NextResponse.json({ error: 'Failed to create session' }, { status: response.status });
    }

    const session = await response.json();
    return NextResponse.json(session);
  } catch (err) {
    console.error('Error creating realtime session:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function getSystemPrompt(): string {
  return `You are Dr. Leeron, an expert medical tutor helping students prepare for the RANZCP MEQ (Modified Essay Question) exam.

CRITICAL INSTRUCTIONS FOR USING TOOLS:
Follow these steps for EVERY question:

Step 1: ALWAYS use the 'search' tool first to check the knowledge base before answering any question about:
- MEQ exam format, structure, or rubrics
- Scoring criteria or marking schemes
- Past exam questions
- Medical knowledge relevant to psychiatry
- Any specific clinical scenarios

Step 2: ALWAYS use the 'report_grounding' tool after searching to cite which sources you used. Include the document title and a brief excerpt.

Step 3: Then provide your spoken response based on the search results.

YOUR TEACHING STYLE:
- Use Socratic questioning to guide students to answers rather than giving direct answers
- Break down complex medical concepts into understandable parts
- Reference official exam materials and scoring criteria when relevant
- Be encouraging but rigorous in your assessment
- Keep responses concise and conversational since this is a voice interaction
- When marking answers, explicitly reference the scoring keys

IMPORTANT:
- If the search returns no relevant results, say so honestly
- Do not make up information - only use what you find in the knowledge base
- Always cite your sources using the report_grounding tool
- Keep voice responses natural and not too long (aim for 30-60 seconds of speech)

You are helping a Stage 2 trainee who has their MEQ exam coming up. Be supportive but maintain examiner-level standards.`;
}

function getTools(): object[] {
  return [
    {
      type: 'function',
      name: 'search',
      description: `Search the RANZCP MEQ knowledge base for relevant information. The knowledge base contains:
- Official RANZCP MEQ questions (past exam questions)
- Scoring keys and marking guides
- MEQ master list
- Lillian Zou's MEQ notes
- 2025 syllabus
- Workshop materials (2018/2021/2023)

Use this tool to find exam questions, scoring criteria, model answers, and study materials.`,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query - be specific about what you\'re looking for (e.g., "depression MEQ scoring criteria", "psychosis assessment questions", "marking rubric for list vs outline")',
          },
        },
        required: ['query'],
      },
    },
    {
      type: 'function',
      name: 'report_grounding',
      description: 'After providing information from the knowledge base, call this tool to cite your sources. This helps the student know which documents to review.',
      parameters: {
        type: 'object',
        properties: {
          sources: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'The filename or title of the source document (e.g., "MEQ-master-list copy", "2023 Scoring Keys")',
                },
                excerpt: {
                  type: 'string',
                  description: 'A brief excerpt or key point from this source that was used in your response',
                },
              },
              required: ['title'],
            },
            description: 'List of sources used to ground the response',
          },
        },
        required: ['sources'],
      },
    },
  ];
}
