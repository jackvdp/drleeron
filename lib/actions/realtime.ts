import { openai } from './openai';
import { resolveVectorStoreId } from './vector-store';

// ─── System prompt for voice tutor ───────────────────────────────────────────
const REALTIME_SYSTEM_PROMPT = `You are Dr. Leeron, an expert medical tutor helping students prepare for the RANZCP MEQ (Modified Essay Question) exam.

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

// ─── Tool definitions for realtime session ───────────────────────────────────
const REALTIME_TOOLS = [
  {
    type: 'function' as const,
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
          description: 'The search query - be specific about what you\'re looking for (e.g., "depression MEQ scoring criteria", "psychosis assessment questions")',
        },
      },
      required: ['query'],
    },
  },
  {
    type: 'function' as const,
    name: 'report_grounding',
    description: 'After providing information from the knowledge base, call this tool to cite your sources.',
    parameters: {
      type: 'object',
      properties: {
        sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Source document title' },
              excerpt: { type: 'string', description: 'Brief excerpt used in response' },
            },
            required: ['title'],
          },
          description: 'List of sources used',
        },
      },
      required: ['sources'],
    },
  },
];

// ─── Create an ephemeral realtime session token ──────────────────────────────
export async function createRealtimeSession() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-realtime-preview-2024-12-17',
      voice: 'coral',
      modalities: ['text', 'audio'],
      instructions: REALTIME_SYSTEM_PROMPT,
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      input_audio_transcription: { model: 'whisper-1' },
      turn_detection: {
        type: 'server_vad',
        threshold: 0.8,
        prefix_padding_ms: 300,
        silence_duration_ms: 700,
      },
      tools: REALTIME_TOOLS,
      tool_choice: 'auto',
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to create realtime session:', error);
    throw new Error('Failed to create session');
  }

  return response.json();
}

// ─── Search the knowledge base (vector store) ────────────────────────────────
interface SearchResult {
  rank: number;
  source: string;
  content: string;
  relevanceScore: string;
}

export async function searchKnowledgeBase(query: string, explicitVectorStoreId?: string | null): Promise<{
  success: boolean;
  query: string;
  resultCount: number;
  results: SearchResult[];
  message: string;
}> {
  if (!query || typeof query !== 'string') {
    throw new Error('Missing query parameter');
  }

  const vectorStoreId = explicitVectorStoreId || await resolveVectorStoreId();
  if (!vectorStoreId) {
    return {
      success: false,
      query,
      resultCount: 0,
      results: [],
      message: 'No knowledge base configured. Set VECTOR_STORE_ID or create a vector store.',
    };
  }

  const response = await openai.responses.create({
    model: 'gpt-4o-mini',
    input: query,
    instructions: `You are a search assistant. Search the knowledge base for information relevant to the query and return the most relevant passages.

For each piece of information you find, clearly indicate:
1. The source document filename
2. The relevant content/passage

Format your response as a clear summary of what was found, organized by source document.
If no relevant information is found, say so clearly.`,
    tools: [
      {
        type: 'file_search',
        vector_store_ids: [vectorStoreId],
        max_num_results: 10,
      },
    ],
    tool_choice: 'required',
    include: ['file_search_call.results'],
  });

  const results: { filename: string; content: string; score?: number }[] = [];
  const seenContent = new Set<string>();

  if (response.output) {
    for (const item of response.output) {
      if (item.type === 'file_search_call' && item.results) {
        for (const result of item.results) {
          const content = result.text || '';
          const filename = result.filename || 'Unknown Document';
          const key = content.slice(0, 100);
          if (seenContent.has(key)) continue;
          seenContent.add(key);
          results.push({ filename, content, score: result.score });
        }
      }

      if (item.type === 'message' && item.content) {
        for (const content of item.content) {
          if (content.type === 'output_text' && content.annotations) {
            for (const annotation of content.annotations) {
              if (annotation.type === 'file_citation') {
                const citation = annotation as { filename?: string };
                const any = annotation as unknown as Record<string, unknown>;
                const quote = (any.quote as string) || (any.text as string) || '';
                if (quote && !seenContent.has(quote.slice(0, 100))) {
                  seenContent.add(quote.slice(0, 100));
                  results.push({ filename: citation.filename || 'Document', content: quote });
                }
              }
            }
          }
        }
      }
    }
  }

  results.sort((a, b) => (b.score || 0) - (a.score || 0));

  const formatted = results.slice(0, 8).map((r, i) => ({
    rank: i + 1,
    source: r.filename,
    content: r.content.slice(0, 1500),
    relevanceScore: r.score ? Math.round(r.score * 100) + '%' : 'N/A',
  }));

  return {
    success: true,
    query,
    resultCount: formatted.length,
    results: formatted,
    message: formatted.length > 0
      ? `Found ${formatted.length} relevant passages from the knowledge base.`
      : `No relevant information found in the knowledge base for: "${query}"`,
  };
}
