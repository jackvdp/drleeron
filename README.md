# Dr. Leeron - Medical Student Tutor Chatbot

A voice-enabled AI chatbot built to help medical students learn through interactive conversations. Dr. Leeron uses advanced AI to break down complex medical concepts and guide students through their studies.

## Tech Stack

### Frontend
- **Next.js 15.5.6** - React framework with App Router
- **React 19** - UI library
- **TypeScript** - Type-safe development
- **Tailwind CSS 4** - Utility-first CSS framework
- **shadcn/ui** - High-quality, accessible UI components built on Radix UI
  - Components: Button, Input, Card, Avatar, ScrollArea

### AI & Backend
- **Vercel AI SDK v5** (`ai` v5.0.76) - AI integration framework
  - `@ai-sdk/react` - React hooks for chat UI (`useChat`)
  - `@ai-sdk/openai` - OpenAI provider integration
- **OpenAI API** (v6.6.0)
  - GPT-4 - Text chat responses
  - Whisper - Speech-to-text transcription
  - TTS (Text-to-Speech) - Voice output

### Development
- **TypeScript 5** - Static type checking
- **ESLint** - Code linting
- **Turbopack** - Fast bundler (Next.js dev mode)

## Project Structure

```
drleeron/
├── app/
│   ├── api/
│   │   ├── chat/
│   │   │   └── route.ts          # Main chat endpoint (GPT-4 streaming)
│   │   ├── transcribe/
│   │   │   └── route.ts          # Whisper speech-to-text API
│   │   └── speak/
│   │       └── route.ts          # OpenAI TTS API
│   ├── page.tsx                  # Main chat UI component
│   ├── layout.tsx                # Root layout
│   └── globals.css               # Global styles
├── components/
│   └── ui/                       # shadcn/ui components
│       ├── button.tsx
│       ├── input.tsx
│       ├── card.tsx
│       ├── avatar.tsx
│       └── scroll-area.tsx
├── lib/
│   └── utils.ts                  # Utility functions (cn helper)
├── .env.local                    # Environment variables (OpenAI API key)
└── package.json
```

## Key Features

### 1. Text Chat
- Real-time streaming responses from GPT-4
- Message history with user and assistant avatars
- Loading states and error handling

### 2. Voice Input
- Browser microphone recording
- Whisper API transcription
- Automatic input field population

### 3. Voice Output
- Text-to-speech on AI responses
- Click "Speak" button to hear any message
- Audio playback controls

## Environment Variables

Required in `.env.local`:

```env
OPENAI_API_KEY=sk-proj-xxxxx
```

## API Routes

### `/api/chat` (POST)
**Purpose:** Main chat endpoint for streaming AI responses

**Request:**
```json
{
  "messages": [
    {
      "role": "user",
      "parts": [{ "type": "text", "text": "Explain osmosis" }],
      "id": "..."
    }
  ]
}
```

**Response:** Server-Sent Events (SSE) stream with UIMessage chunks

**Tech:**
- Converts UIMessages to ModelMessages using `convertToModelMessages()`
- Streams text using `streamText()` from Vercel AI SDK
- Returns via `toUIMessageStreamResponse()`

### `/api/transcribe` (POST)
**Purpose:** Convert voice recordings to text

**Request:** FormData with audio file (webm format)

**Response:**
```json
{
  "text": "transcribed text here"
}
```

**Tech:**
- OpenAI Whisper API (`whisper-1` model)
- Accepts audio blob from browser MediaRecorder

### `/api/speak` (POST)
**Purpose:** Convert text to speech audio

**Request:**
```json
{
  "text": "text to speak"
}
```

**Response:** Audio file (MP3 format)

**Tech:**
- OpenAI TTS API (`tts-1` model, `alloy` voice)
- Returns audio buffer as Response

## React Hooks & Components

### `useChat` Hook
From `@ai-sdk/react`, provides:
- `messages` - Array of UIMessage objects
- `sendMessage()` - Send user message to API
- `status` - Chat state ('ready', 'submitted', 'streaming', 'error')
- `error` - Error object if request fails

**Configuration:**
```typescript
const { messages, sendMessage, status, error } = useChat({
  api: '/api/chat',
});
```

### Message Format

**UIMessage** (Frontend/Hook):
```typescript
{
  id: string,
  role: 'user' | 'assistant' | 'system',
  parts: [{ type: 'text', text: string }],
  status: 'submitted' | 'streaming' | 'ready' | 'error'
}
```

**ModelMessage** (Backend/AI SDK):
```typescript
{
  role: 'user' | 'assistant' | 'system',
  content: string | Array<{ type: 'text', text: string }>
}
```

## Dependencies

### Core
```json
{
  "ai": "^5.0.76",
  "@ai-sdk/react": "^2.0.76",
  "@ai-sdk/openai": "^2.0.53",
  "openai": "^6.6.0",
  "next": "15.5.6",
  "react": "19.1.0"
}
```

### UI
```json
{
  "@radix-ui/react-avatar": "^1.1.10",
  "@radix-ui/react-scroll-area": "^1.2.10",
  "@radix-ui/react-slot": "^1.2.3",
  "lucide-react": "^0.546.0",
  "tailwindcss": "^4",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "tailwind-merge": "^3.3.1"
}
```

## Scripts

```bash
npm run dev    # Start development server (with Turbopack)
npm run build  # Build for production
npm run start  # Start production server
npm run lint   # Run ESLint
```

## Browser APIs Used

### MediaRecorder API
- Records audio from user's microphone
- Produces WebM audio blobs
- Requires microphone permission

### Web Audio API
- Plays TTS audio responses
- Creates audio elements from blob URLs
- Manages playback state

## Vercel AI SDK v5 Key Concepts

### Message Conversion
- Frontend sends UIMessages (with `parts` array)
- Backend converts to ModelMessages (with `content` field)
- Use `convertToModelMessages()` for conversion

### Streaming Responses
- `streamText()` creates streaming text generation
- `toUIMessageStreamResponse()` formats for React hooks
- SSE protocol for real-time updates

### System Prompts
- Defined in API route with `system` parameter
- Sets AI personality and behavior
- Applies to entire conversation

## Cost Considerations

Approximate OpenAI API costs:
- **GPT-4**: ~$0.03 per 1K output tokens
- **Whisper**: ~$0.006 per minute of audio
- **TTS**: ~$0.015 per 1K characters

Set usage limits in OpenAI dashboard to control spending.
