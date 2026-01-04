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
      description: 'Search the knowledge base for information about medical topics, exam materials, scoring criteria, or any relevant content to answer the student\'s question.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find relevant information in the knowledge base',
          },
        },
        required: ['query'],
      },
    },
    {
      type: 'function',
      name: 'report_grounding',
      description: 'Report which sources from the knowledge base were used to ground the response. Call this after using information from the search results.',
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
                  description: 'The title or name of the source document',
                },
                excerpt: {
                  type: 'string',
                  description: 'A brief excerpt from the source that was used',
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

// Handle function calls from the Realtime API
async function handleFunctionCall(event: RealtimeEvent, openaiWs: WebSocket, clientWs: WebSocket): Promise<void> {
  const callId = event.call_id as string;
  const name = event.name as string;
  const args = JSON.parse(event.arguments as string);

  console.log(`Function call: ${name}`, args);

  let result: unknown;

  try {
    if (name === 'search') {
      result = await performSearch(args.query);
    } else if (name === 'report_grounding') {
      result = { success: true, sources: args.sources };
      // Send grounding info to client for citation display
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'grounding.sources',
          sources: args.sources,
        }));
      }
    } else {
      result = { error: `Unknown function: ${name}` };
    }
  } catch (err) {
    console.error(`Error executing function ${name}:`, err);
    result = { error: `Failed to execute ${name}` };
  }

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

// Search the vector store using Responses API with file_search
async function performSearch(query: string): Promise<object> {
  console.log('Searching for:', query);

  if (!VECTOR_STORE_ID) {
    console.warn('No VECTOR_STORE_ID configured');
    return {
      results: [],
      message: 'No knowledge base configured',
    };
  }

  try {
    // Use the Responses API with file_search to query the vector store
    const response = await openai.responses.create({
      model: 'gpt-4o-mini', // Use smaller model for search extraction
      input: `Search query: "${query}"\n\nFind and return the most relevant passages from the knowledge base that relate to this query. Return the key information in a structured format.`,
      tools: [
        {
          type: 'file_search',
          vector_store_ids: [VECTOR_STORE_ID],
        },
      ],
    });

    // Extract the search results from the response
    const results: { title: string; content: string }[] = [];
    
    // The response output contains the file search results
    if (response.output) {
      for (const item of response.output) {
        if (item.type === 'message' && item.content) {
          for (const content of item.content) {
            if (content.type === 'output_text') {
              // Extract text content
              results.push({
                title: 'Knowledge Base',
                content: content.text || '',
              });
              
              // Handle annotations which contain file citations
              if (content.annotations) {
                for (const annotation of content.annotations) {
                  if (annotation.type === 'file_citation') {
                    const fileCitation = annotation as { 
                      type: 'file_citation'; 
                      filename?: string; 
                      quote?: string;
                    };
                    if (fileCitation.quote) {
                      results.push({
                        title: fileCitation.filename || 'Document',
                        content: fileCitation.quote,
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    console.log(`Search returned ${results.length} results`);
    
    return {
      results: results.length > 0 ? results : [{ 
        title: 'No results', 
        content: `No specific information found for: "${query}"` 
      }],
    };
  } catch (err) {
    console.error('Search error:', err);
    return { 
      error: 'Search failed', 
      results: [],
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
