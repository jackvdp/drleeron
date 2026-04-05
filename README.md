# Dr Leeron - RANZCP MEQ Voice Tutor

A voice-enabled AI tutor that helps psychiatry trainees prepare for the RANZCP MEQ (Modified Essay Question) exam. Speak naturally with Dr Leeron and get Socratic-style guidance grounded in real exam materials, scoring keys, and syllabi.

## How It Works

The app uses **OpenAI's Realtime API** for live voice conversation and **Retrieval Augmented Generation (RAG)** to ground responses in your uploaded exam materials. There is no custom server — the browser connects directly to OpenAI, and two lightweight API routes handle authentication and knowledge base search.

### Architecture Overview

```
                                          ┌──────────────────┐
                                          │  OpenAI Vector   │
                                          │  Store           │
                                          │  (exam materials,│
                                          │   scoring keys)  │
                                          └────────▲─────────┘
                                                   │
                                                   │ file_search
                                                   │
┌──────────────┐  WebSocket (audio)  ┌─────────────┴──────────┐
│              │ ◄──────────────────►│                        │
│   Browser    │                     │  OpenAI Realtime API   │
│   Client     │                     │  (gpt-4o-realtime)     │
│              │                     │                        │
└──────┬───────┘                     └────────────────────────┘
       │
       │  HTTPS (REST)
       │
┌──────▼───────────────────────────┐
│  Vercel Serverless Functions     │
│                                  │
│  POST /api/realtime              │
│    → creates ephemeral token     │
│                                  │
│  POST /api/realtime/search       │
│    → queries vector store        │
└──────────────────────────────────┘
```

## Connection Flow (step by step)

### 1. Session Setup

When the page loads, the browser calls `POST /api/realtime` on your server. This endpoint uses your secret `OPENAI_API_KEY` to hit OpenAI's **Session API** (`POST https://api.openai.com/v1/realtime/sessions`) and returns an **ephemeral token** — a short-lived, limited key safe to use in the browser.

The session is pre-configured with:
- **Model:** `gpt-4o-realtime-preview`
- **Voice:** `coral`
- **System prompt:** Dr Leeron's persona and instructions
- **Tools:** `search` and `report_grounding` function definitions
- **Audio format:** PCM16 at 24kHz mono
- **Turn detection:** Server-side VAD (Voice Activity Detection)

### 2. WebSocket Connection

The browser opens a WebSocket directly to OpenAI:

```
wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17
```

Authentication is done via WebSocket subprotocols — the ephemeral token is passed as `openai-insecure-api-key.<token>`. No audio data or conversation content passes through your server.

### 3. Audio Capture and Streaming

The browser captures microphone audio using the Web Audio API:
1. `getUserMedia` gets the mic stream
2. A `ScriptProcessorNode` reads raw audio in chunks of 4096 samples
3. Float32 samples are converted to Int16 PCM
4. PCM data is base64-encoded and sent over the WebSocket as `input_audio_buffer.append` messages

OpenAI's **server-side VAD** detects when the user starts and stops speaking — no silence detection code runs in the browser.

### 4. AI Response (with RAG)

When the user finishes speaking, the Realtime API processes the audio and decides how to respond. Because the session has `search` and `report_grounding` tools configured, the typical flow is:

```
User speaks → VAD detects silence → AI decides to call search tool
   → Client receives function_call event
   → Client calls POST /api/realtime/search with the query
   → Server queries OpenAI Vector Store via Responses API
   → Results sent back to Realtime API as function_call_output
   → AI speaks a response grounded in the search results
   → AI calls report_grounding to cite sources
   → Sources displayed in the UI
```

### 5. Audio Playback

AI audio comes back as base64 PCM chunks (`response.audio.delta` events). The browser:
1. Decodes base64 to Int16 PCM
2. Converts to Float32 for the Web Audio API
3. Creates `AudioBufferSourceNode` instances
4. Schedules them for gapless playback using `playbackTimeRef`

### 6. Barge-In (Interruption)

If the user starts speaking while the AI is talking:
1. VAD fires `speech_started`
2. All playing `AudioBufferSourceNode` instances are stopped
3. A `response.cancel` message is sent to OpenAI to stop generation
4. The new user input is processed normally

## Knowledge Base (RAG) — How It Works

### Vector Store

Exam materials (PDFs, documents) are uploaded to an **OpenAI Vector Store**. OpenAI automatically chunks the documents, generates embeddings, and indexes them for semantic search. The vector store ID is stored in the `VECTOR_STORE_ID` environment variable.

Materials in the knowledge base include:
- Official RANZCP MEQ questions (past exams)
- Scoring keys and marking guides
- MEQ master list
- Study notes
- Syllabus and workshop materials

### Search Flow

When the AI calls the `search` tool, the client sends a POST request to `/api/realtime/search`. This serverless function:

1. Calls the **OpenAI Responses API** (`openai.responses.create()`) with `gpt-4o-mini`
2. The Responses API is configured with a `file_search` tool pointing at the vector store
3. `tool_choice: 'required'` forces it to actually search (not just answer from memory)
4. Results come back as `file_search_call` items with filenames, text content, and relevance scores
5. The top 8 results (deduplicated, sorted by score) are returned to the client
6. The client sends them back to the Realtime API as the function output

This two-hop approach (Realtime API -> your server -> Responses API -> Vector Store) keeps the `OPENAI_API_KEY` and `VECTOR_STORE_ID` off the client while letting the Realtime API use search results to form its spoken response.

### Source Citations

After responding, the AI calls `report_grounding` with an array of `{ title, excerpt }` objects. The client handles this entirely in the browser — it just adds them to the sources panel in the UI.

## OpenAI APIs Used

| API | Purpose | Where Called |
|-----|---------|-------------|
| **Realtime Sessions** (`/v1/realtime/sessions`) | Create ephemeral token with session config | `POST /api/realtime` (server) |
| **Realtime WebSocket** (`wss://api.openai.com/v1/realtime`) | Live bidirectional audio streaming | Browser (direct) |
| **Responses API** (`openai.responses.create`) | Vector store search via `file_search` tool | `POST /api/realtime/search` (server) |
| **Whisper** (`whisper-1`) | Transcribe user audio for transcript display | Configured in session (OpenAI-side) |

## Project Structure

```
drleeron/
├── app/
│   ├── api/
│   │   ├── realtime/
│   │   │   ├── route.ts          # Ephemeral token creation
│   │   │   └── search/
│   │   │       └── route.ts      # Vector store search
│   │   ├── chat/
│   │   │   └── route.ts          # Text chat endpoint (non-realtime)
│   │   ├── transcribe/
│   │   │   └── route.ts          # Whisper speech-to-text
│   │   ├── speak/
│   │   │   └── route.ts          # TTS endpoint
│   │   └── vector-store/         # Vector store management
│   ├── realtime/
│   │   └── page.tsx              # Voice conversation UI
│   ├── text/
│   │   └── page.tsx              # Text chat UI
│   ├── page.tsx                  # Landing page
│   └── layout.tsx                # Root layout
├── components/
│   └── ui/                       # shadcn/ui components
├── lib/
│   └── utils.ts                  # Utility functions
├── scripts/
│   └── upload-documents.ts       # Vector store document upload
├── server.ts                     # Custom server (local dev only)
└── package.json
```

## Environment Variables

Required in `.env.local`:

```env
OPENAI_API_KEY=sk-...        # Your OpenAI API key (never sent to browser)
VECTOR_STORE_ID=vs_...       # OpenAI Vector Store ID for the knowledge base
```

## Tech Stack

- **Next.js 16** with App Router, deployed to Vercel
- **React 19** with TypeScript
- **Tailwind CSS 4** + shadcn/ui
- **OpenAI SDK** (`openai` v6) for Responses API
- **Web Audio API** for mic capture and audio playback
- **WebSocket** (browser-native) for Realtime API connection

## Development

```bash
npm run dev      # tsx watch server.ts (custom server with WebSocket proxy)
npm run build    # next build (for Vercel deployment)
npm run start    # Production with custom server
```

Note: `npm run dev` runs a custom Node.js server (`server.ts`) that provides a local WebSocket proxy at `/api/realtime`. In production on Vercel, the browser connects directly to OpenAI instead — the custom server is not used.

## Audio Specs

| Parameter | Value |
|-----------|-------|
| Sample Rate | 24,000 Hz |
| Channels | Mono (1) |
| Format | PCM Int16 |
| Encoding | Base64 (over WebSocket) |
