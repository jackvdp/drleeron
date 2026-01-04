import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import OpenAI from 'openai';
import { config } from 'dotenv';

// Load environment variables from .env.local
config({ path: '.env.local' });

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// OpenAI configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_API_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17';

// Initialize OpenAI client for vector store search
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Vector store ID - you can make this configurable
const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID || '';

interface RealtimeEvent {
  type: string;
  [key: string]: unknown;
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  // Create WebSocket server for /api/realtime path
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url!, true);

    if (pathname === '/api/realtime') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // Handle WebSocket connections
  wss.on('connection', (clientWs: WebSocket) => {
    console.log('Client connected to /api/realtime');

    // Connect to OpenAI Realtime API
    const openaiWs = new WebSocket(REALTIME_API_URL, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    let isOpenAIConnected = false;
    const messageQueue: string[] = [];

    openaiWs.on('open', () => {
      console.log('Connected to OpenAI Realtime API');
      isOpenAIConnected = true;

      // Configure the session
      const sessionConfig: RealtimeEvent = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: getSystemPrompt(),
          voice: 'coral',
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
        },
      };

      openaiWs.send(JSON.stringify(sessionConfig));
      console.log('Session configured');

      // Send any queued messages
      while (messageQueue.length > 0) {
        const msg = messageQueue.shift()!;
        openaiWs.send(msg);
      }
    });

    openaiWs.on('message', async (data: Buffer) => {
      try {
        const event: RealtimeEvent = JSON.parse(data.toString());
        
        // Handle function calls
        if (event.type === 'response.function_call_arguments.done') {
          await handleFunctionCall(event, openaiWs, clientWs);
          return;
        }

        // Log important events (but not audio deltas to reduce noise)
        if (event.type !== 'response.audio.delta') {
          console.log('OpenAI event:', event.type);
        }

        // Forward event to client
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data.toString());
        }
      } catch (err) {
        console.error('Error processing OpenAI message:', err);
      }
    });

    openaiWs.on('error', (err) => {
      console.error('OpenAI WebSocket error:', err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'error', error: 'OpenAI connection error' }));
      }
    });

    openaiWs.on('close', () => {
      console.log('OpenAI WebSocket closed');
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close();
      }
    });

    // Handle messages from client
    clientWs.on('message', (data: Buffer) => {
      try {
        const message = data.toString();
        
        if (isOpenAIConnected && openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.send(message);
        } else {
          // Queue message until connected
          messageQueue.push(message);
        }
      } catch (err) {
        console.error('Error forwarding client message:', err);
      }
    });

    clientWs.on('close', () => {
      console.log('Client disconnected');
      if (openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.close();
      }
    });

    clientWs.on('error', (err) => {
      console.error('Client WebSocket error:', err);
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});

// System prompt for Dr. Leeron
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

// Tool definitions for function calling
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

// Search result interface
interface SearchResult {
  filename: string;
  content: string;
  score?: number;
}

// Handle function calls from the Realtime API
async function handleFunctionCall(event: RealtimeEvent, openaiWs: WebSocket, clientWs: WebSocket): Promise<void> {
  const callId = event.call_id as string;
  const name = event.name as string;
  const args = JSON.parse(event.arguments as string);

  console.log(`\n📞 Function call: ${name}`);
  console.log('   Arguments:', JSON.stringify(args, null, 2));

  let result: unknown;

  try {
    if (name === 'search') {
      const searchResults = await performSearch(args.query);
      result = searchResults;
      
      // Also send search status to client for UI feedback
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'search.completed',
          query: args.query,
          resultCount: (searchResults as { results: SearchResult[] }).results?.length || 0,
        }));
      }
    } else if (name === 'report_grounding') {
      result = handleReportGrounding(args.sources, clientWs);
    } else {
      result = { error: `Unknown function: ${name}` };
    }
  } catch (err) {
    console.error(`❌ Error executing function ${name}:`, err);
    result = { error: `Failed to execute ${name}`, message: err instanceof Error ? err.message : 'Unknown error' };
  }

  console.log(`   Result preview:`, JSON.stringify(result, null, 2).slice(0, 500));

  // Send function result back to OpenAI
  const functionOutput: RealtimeEvent = {
    type: 'conversation.item.create',
    item: {
      type: 'function_call_output',
      call_id: callId,
      output: JSON.stringify(result),
    },
  };

  openaiWs.send(JSON.stringify(functionOutput));

  // Trigger response generation
  const responseCreate: RealtimeEvent = {
    type: 'response.create',
  };
  openaiWs.send(JSON.stringify(responseCreate));
}

// Handle the report_grounding tool - extract and send citation info to client
function handleReportGrounding(sources: Array<{ title: string; excerpt?: string }>, clientWs: WebSocket): object {
  console.log(`\n📚 Report grounding called with ${sources?.length || 0} sources`);
  
  if (!sources || sources.length === 0) {
    return { success: true, message: 'No sources to report' };
  }

  // Format sources for the client
  const formattedSources = sources.map((source, index) => ({
    id: `source-${Date.now()}-${index}`,
    title: source.title || 'Unknown Document',
    excerpt: source.excerpt || '',
  }));

  // Send grounding info to client for citation display
  if (clientWs.readyState === WebSocket.OPEN) {
    clientWs.send(JSON.stringify({
      type: 'grounding.sources',
      sources: formattedSources,
    }));
    console.log('   ✅ Sent sources to client');
  }

  return { 
    success: true, 
    sourcesReported: formattedSources.length,
    sources: formattedSources,
  };
}

// Search the vector store using Responses API with file_search
async function performSearch(query: string): Promise<object> {
  console.log(`\n🔍 Searching vector store for: "${query}"`);

  if (!VECTOR_STORE_ID) {
    console.warn('   ⚠️ No VECTOR_STORE_ID configured');
    return {
      results: [],
      message: 'No knowledge base configured. Please set VECTOR_STORE_ID in .env.local',
    };
  }

  try {
    const startTime = Date.now();
    
    // Use the Responses API with file_search to query the vector store
    // This leverages OpenAI's built-in retrieval which handles chunking and relevance
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
          max_num_results: 10, // Get top 10 most relevant chunks
        },
      ],
      tool_choice: 'required', // Force it to use file_search
    });

    const searchTime = Date.now() - startTime;
    console.log(`   ⏱️ Search completed in ${searchTime}ms`);

    // Extract the search results
    const results: SearchResult[] = [];
    const seenContent = new Set<string>(); // Avoid duplicates
    
    if (response.output) {
      for (const item of response.output) {
        // Handle file search tool calls to get raw results
        if (item.type === 'file_search_call' && item.results) {
          for (const searchResult of item.results) {
            const content = searchResult.text || '';
            const filename = searchResult.filename || 'Unknown Document';
            
            // Skip duplicates
            const contentKey = content.slice(0, 100);
            if (seenContent.has(contentKey)) continue;
            seenContent.add(contentKey);
            
            results.push({
              filename,
              content,
              score: searchResult.score,
            });
          }
        }
        
        // Also extract from message content with annotations
        if (item.type === 'message' && item.content) {
          for (const content of item.content) {
            if (content.type === 'output_text' && content.annotations) {
              for (const annotation of content.annotations) {
                if (annotation.type === 'file_citation') {
                  const citation = annotation as {
                    type: 'file_citation';
                    filename?: string;
                    file_id?: string;
                    index?: number;
                  };
                  
                  // Try to get the quoted text from the annotation
                  const annotationAny = annotation as unknown as Record<string, unknown>;
                  const quote = (annotationAny.quote as string) || (annotationAny.text as string) || '';
                  
                  if (quote && !seenContent.has(quote.slice(0, 100))) {
                    seenContent.add(quote.slice(0, 100));
                    results.push({
                      filename: citation.filename || 'Document',
                      content: quote,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    console.log(`   📄 Found ${results.length} unique results`);
    
    // Format results for the Realtime API
    if (results.length === 0) {
      return {
        success: true,
        query,
        results: [],
        message: `No relevant information found in the knowledge base for: "${query}"`,
        suggestion: 'Try rephrasing your question or ask about a different topic.',
      };
    }

    // Sort by score if available
    results.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Format for the model to use
    const formattedResults = results.slice(0, 8).map((r, i) => ({
      rank: i + 1,
      source: r.filename,
      content: r.content.slice(0, 1500), // Limit content length
      relevanceScore: r.score ? Math.round(r.score * 100) + '%' : 'N/A',
    }));

    return {
      success: true,
      query,
      resultCount: formattedResults.length,
      results: formattedResults,
      message: `Found ${formattedResults.length} relevant passages from the knowledge base.`,
    };
  } catch (err) {
    console.error('   ❌ Search error:', err);
    return { 
      success: false,
      error: 'Search failed', 
      results: [],
      message: err instanceof Error ? err.message : 'Unknown error',
      suggestion: 'The knowledge base search encountered an error. Please try again.',
    };
  }
}
