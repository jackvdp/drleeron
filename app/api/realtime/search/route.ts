import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID || '';

interface SearchResult {
  filename: string;
  content: string;
  score?: number;
}

// POST /api/realtime/search — execute vector store search server-side
export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 });
    }

    if (!VECTOR_STORE_ID) {
      return NextResponse.json({
        results: [],
        message: 'No knowledge base configured. Please set VECTOR_STORE_ID.',
      });
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
          vector_store_ids: [VECTOR_STORE_ID],
          max_num_results: 10,
        },
      ],
      tool_choice: 'required',
    });

    const results: SearchResult[] = [];
    const seenContent = new Set<string>();

    if (response.output) {
      for (const item of response.output) {
        if (item.type === 'file_search_call' && item.results) {
          for (const searchResult of item.results) {
            const content = searchResult.text || '';
            const filename = searchResult.filename || 'Unknown Document';

            const contentKey = content.slice(0, 100);
            if (seenContent.has(contentKey)) continue;
            seenContent.add(contentKey);

            results.push({ filename, content, score: searchResult.score });
          }
        }

        if (item.type === 'message' && item.content) {
          for (const content of item.content) {
            if (content.type === 'output_text' && content.annotations) {
              for (const annotation of content.annotations) {
                if (annotation.type === 'file_citation') {
                  const citation = annotation as {
                    type: 'file_citation';
                    filename?: string;
                    file_id?: string;
                  };
                  const annotationAny = annotation as unknown as Record<string, unknown>;
                  const quote = (annotationAny.quote as string) || (annotationAny.text as string) || '';

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

    const formattedResults = results.slice(0, 8).map((r, i) => ({
      rank: i + 1,
      source: r.filename,
      content: r.content.slice(0, 1500),
      relevanceScore: r.score ? Math.round(r.score * 100) + '%' : 'N/A',
    }));

    return NextResponse.json({
      success: true,
      query,
      resultCount: formattedResults.length,
      results: formattedResults,
      message: formattedResults.length > 0
        ? `Found ${formattedResults.length} relevant passages from the knowledge base.`
        : `No relevant information found in the knowledge base for: "${query}"`,
    });
  } catch (err) {
    console.error('Search error:', err);
    return NextResponse.json({
      success: false,
      error: 'Search failed',
      results: [],
      message: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
