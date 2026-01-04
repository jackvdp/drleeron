# Dr Leeron - Project Documentation

## Overview

Dr Leeron is a voice-enabled AI tutoring application designed to help medical students prepare for the RANZCP MEQ (Modified Essay Question) exam. The application uses OpenAI's Realtime API to enable natural voice conversations with an AI tutor that employs Socratic questioning methodology.

## Architecture

### Realtime Voice Conversation Pattern

This project implements a **VoiceRAG** (Voice + Retrieval Augmented Generation) pattern, combining real-time voice interaction with knowledge base retrieval. The architecture is inspired by and follows patterns outlined in Microsoft's VoiceRAG reference implementation:

**Reference:** [VoiceRAG: An App Pattern for RAG + Voice Using Azure AI Search and the GPT-4o Realtime API](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/voicerag-an-app-pattern-for-rag--voice-using-azure-ai-search-and-the-gpt-4o-real/4259116)

### Key Components

```
┌─────────────────┐     WebSocket      ┌─────────────────┐     WebSocket     ┌──────────────────┐
│                 │ ◄─────────────────► │                 │ ◄────────────────► │                  │
│  Browser Client │    (Proxy Layer)   │  Next.js Server │   (Realtime API)  │  OpenAI Realtime │
│  (React + Web   │                    │  /api/realtime  │                   │  API             │
│   Audio API)    │                    │                 │                   │                  │
└─────────────────┘                    └─────────────────┘                   └──────────────────┘
                                              │
                                              │ File Search Tool
                                              ▼
                                       ┌─────────────────┐
                                       │  OpenAI Vector  │
                                       │  Store          │
                                       │  (Knowledge     │
                                       │   Base)         │
                                       └─────────────────┘
```

### Audio Flow

1. **Microphone Capture**: Browser captures audio using `ScriptProcessorNode` (or AudioWorklet)
2. **PCM Encoding**: Float32 audio samples converted to Int16 PCM, then base64 encoded
3. **WebSocket Transport**: Audio chunks sent via `input_audio_buffer.append` messages
4. **Server-Side VAD**: OpenAI's server-side Voice Activity Detection handles speech segmentation
5. **Response Streaming**: AI audio responses streamed back as base64 PCM chunks
6. **Playback Scheduling**: Audio chunks scheduled for gapless playback using Web Audio API

### Barge-In / Interruption Handling

The application supports natural conversation interruption (barge-in), allowing users to interrupt the AI mid-response:

```typescript
// On speech_started event from server VAD:
case 'input_audio_buffer.speech_started':
  // 1. Stop all currently playing/scheduled audio
  stopAllAudio();
  
  // 2. Cancel the current response generation
  cancelResponse();
  
  // 3. Reset UI state
  setIsSpeaking(false);
  setIsThinking(false);
  break;
```

**Key implementation details:**
- Track all `AudioBufferSourceNode` instances in a ref array
- On interruption, call `source.stop()` on all tracked sources
- Reset `playbackTimeRef` to current audio context time
- Send `response.cancel` message to server to stop generation

### Knowledge Base Integration (RAG)

The Realtime API is configured with a file search tool that queries a vector store containing RANZCP MEQ exam materials:

```typescript
// Server-side session configuration
tools: [
  {
    type: 'file_search',
    vector_store_ids: [process.env.OPENAI_VECTOR_STORE_ID],
  },
],
```

When the AI needs to reference exam materials, marking guides, or clinical scenarios, it automatically searches the vector store and grounds its responses in the retrieved content.

## Project Structure

```
drleeron/
├── app/
│   ├── api/
│   │   ├── realtime/
│   │   │   └── route.ts      # WebSocket proxy to OpenAI Realtime API
│   │   ├── chat/
│   │   │   └── route.ts      # Text chat endpoint (non-realtime)
│   │   ├── transcribe/
│   │   │   └── route.ts      # Whisper speech-to-text
│   │   └── speak/
│   │       └── route.ts      # TTS endpoint
│   ├── realtime/
│   │   ├── page.tsx          # Voice conversation UI
│   │   └── layout.tsx        # Page metadata
│   ├── page.tsx              # Text chat UI
│   └── layout.tsx            # Root layout
├── components/
│   └── ui/                   # shadcn/ui components
├── lib/
│   └── utils.ts              # Utility functions
└── scripts/
    └── upload-to-vector-store.ts  # Vector store management
```

## Key Files

### `/app/api/realtime/route.ts`
WebSocket proxy that:
- Authenticates with OpenAI Realtime API
- Configures session with system prompt, voice, and tools
- Relays messages bidirectionally between client and OpenAI
- Handles connection lifecycle

### `/app/realtime/page.tsx`
React component implementing:
- WebSocket connection management
- Audio capture from microphone (24kHz, mono, PCM)
- Audio playback with scheduling for gapless streaming
- Barge-in/interruption handling
- Visual feedback (orb animation states)
- Transcript display

## Environment Variables

```env
OPENAI_API_KEY=sk-...
OPENAI_VECTOR_STORE_ID=vs_...
```

## Audio Specifications

| Parameter | Value |
|-----------|-------|
| Sample Rate | 24,000 Hz |
| Channels | Mono (1) |
| Format | PCM Int16 |
| Encoding | Base64 |

## Event Flow

### User Speaking
```
speech_started → (capture audio) → speech_stopped → committed → 
response.created → [file_search if needed] → response.audio.delta (streaming) → 
response.audio.done → response.done
```

### Interruption (Barge-In)
```
(AI speaking) → speech_started → stopAllAudio() + cancelResponse() →
response.cancelled → (new user input processed)
```

## Development Notes

### ScriptProcessorNode Deprecation
The current implementation uses `ScriptProcessorNode` which is deprecated. For production, consider migrating to `AudioWorklet` for better performance and to avoid main thread blocking.

### Echo Cancellation
Browser echo cancellation is enabled via `getUserMedia` constraints, but effectiveness varies by browser/device. Consider implementing additional echo cancellation if needed.

### Connection Resilience
Current implementation does not include automatic reconnection. Consider adding:
- Exponential backoff reconnection
- Connection state persistence
- Graceful degradation to text chat

## References

- [OpenAI Realtime API Documentation](https://platform.openai.com/docs/guides/realtime)
- [VoiceRAG Pattern (Microsoft)](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/voicerag-an-app-pattern-for-rag--voice-using-azure-ai-search-and-the-gpt-4o-real/4259116)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
