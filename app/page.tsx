'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, Send, Volume2, Database, X, MessageSquare, BookOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

type MessagePart = {
  type: 'text';
  text: string;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
};

interface VectorStore {
  id: string;
  name: string;
  status: string;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [vectorStores, setVectorStores] = useState<VectorStore[]>([]);
  const [selectedVectorStore, setSelectedVectorStore] = useState<string | null>(null);
  const [showVectorStoreSelector, setShowVectorStoreSelector] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Load vector stores on mount
  useEffect(() => {
    loadVectorStores();
  }, []);

  const loadVectorStores = async () => {
    try {
      const response = await fetch('/api/vector-store');
      const data = await response.json();
      const stores = data.vectorStores || [];
      setVectorStores(stores);
      // Default to first vector store if available
      if (stores.length > 0 && !selectedVectorStore) {
        setSelectedVectorStore(stores[0].id);
      }
    } catch (error) {
      console.error('Error loading vector stores:', error);
    }
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Transcribe audio to text
  const transcribeAudio = async (audioBlob: Blob): Promise<string | null> => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    setIsTranscribing(true);
    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setIsTranscribing(false);
      
      if (data.text) {
        setInput(data.text);
        return data.text;
      }
      return null;
    } catch (error) {
      console.error('Error transcribing audio:', error);
      setIsTranscribing(false);
      return null;
    }
  };

  // Speak the AI's response with streaming audio
  const speakText = async (text: string) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    setIsSpeaking(true);
    
    try {
      const response = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const audioContext = audioContextRef.current;
      
      let nextStartTime = audioContext.currentTime;
      let leftover = new Uint8Array(0);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const combined = new Uint8Array(leftover.length + value.length);
        combined.set(leftover);
        combined.set(value, leftover.length);

        const usableLength = combined.length - (combined.length % 2);
        leftover = combined.slice(usableLength);

        if (usableLength === 0) continue;

        const pcmData = new Int16Array(combined.slice(0, usableLength).buffer);

        const floatData = new Float32Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
          floatData[i] = pcmData[i] / 32768;
        }

        const audioBuffer = audioContext.createBuffer(1, floatData.length, 24000);
        audioBuffer.getChannelData(0).set(floatData);

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        const startTime = Math.max(nextStartTime, audioContext.currentTime);
        source.start(startTime);
        nextStartTime = startTime + audioBuffer.duration;
      }

      const remainingTime = nextStartTime - audioContext.currentTime;
      if (remainingTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingTime * 1000));
      }
      
      setIsSpeaking(false);
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsSpeaking(false);
    }
  };

  // Send message and handle streaming from API route
  const sendMessage = async (userMessage: string) => {
    if (!userMessage.trim()) return;

    setIsLoading(true);
    setError(null);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      parts: [{ type: 'text', text: userMessage }],
    };
    setMessages((prev) => [...prev, userMsg]);

    const assistantMsgId = (Date.now() + 1).toString();
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      parts: [{ type: 'text', text: '' }],
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          vectorStoreId: selectedVectorStore,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No reader available');
      }

      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.trim() && line.startsWith('0:')) {
            try {
              const textChunk = JSON.parse(line.slice(2));
              accumulatedText = textChunk;

              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, parts: [{ type: 'text', text: accumulatedText }] }
                    : msg
                )
              );
            } catch (e) {
              console.error('Error parsing chunk:', e);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantMsgId));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage(input);
      setInput('');
    }
  };

  const selectedStoreName = vectorStores.find(s => s.id === selectedVectorStore)?.name;

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Navy blue gradient background */}
      <div 
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(
              ellipse at 50% 50%,
              rgba(30, 58, 95, 1) 0%,
              rgba(20, 45, 80, 1) 35%,
              rgba(15, 35, 65, 1) 60%,
              rgba(10, 28, 55, 1) 80%,
              rgba(8, 22, 45, 1) 100%
            )
          `,
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-screen max-w-4xl mx-auto p-4">
        
        {/* Header */}
        <div className="text-center py-6">
          <h1 className="text-4xl font-light text-white/90 tracking-wide">Dr Leeron</h1>
          <p className="text-white/50 text-sm mt-2 mb-3">RANZCP MEQ Text Tutor</p>
          <p className="text-white/40 text-sm max-w-md mx-auto leading-relaxed">
            Practice for your RANZCP MEQ exam through text-based Socratic dialogue.
            Ask questions and work through clinical scenarios together.
          </p>
        </div>

        {/* Knowledge Base Selector */}
        <div className="flex justify-center mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowVectorStoreSelector(!showVectorStoreSelector)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 ${
                selectedVectorStore 
                  ? 'bg-blue-500/20 border border-blue-400/30 text-blue-300'
                  : 'bg-white/5 border border-white/10 text-white/60 hover:text-white/80 hover:bg-white/10'
              }`}
            >
              <Database className="w-4 h-4" />
              <span className="text-sm">
                {selectedStoreName || 'Select Knowledge Base'}
              </span>
            </button>
            
            {selectedVectorStore && (
              <button
                onClick={() => setSelectedVectorStore(null)}
                className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/60 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Vector Store Dropdown */}
        {showVectorStoreSelector && (
          <div className="flex justify-center mb-4">
            <div className="bg-black/40 backdrop-blur-xl rounded-xl border border-white/10 p-2 max-w-sm w-full">
              {vectorStores.length === 0 ? (
                <p className="text-white/40 text-sm text-center py-2">No knowledge bases available</p>
              ) : (
                vectorStores.map((store) => (
                  <button
                    key={store.id}
                    onClick={() => {
                      setSelectedVectorStore(store.id);
                      setShowVectorStoreSelector(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                      selectedVectorStore === store.id
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'text-white/70 hover:bg-white/10'
                    }`}
                  >
                    {store.name}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {selectedVectorStore && (
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20">
              <BookOpen className="w-3 h-3 text-blue-400" />
              <span className="text-xs text-blue-300">AI will search knowledge base for answers</span>
            </div>
          </div>
        )}

        {/* Messages Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto mb-4 rounded-2xl bg-black/20 backdrop-blur-sm border border-white/5 p-4"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageSquare className="w-12 h-12 text-white/20 mb-4" />
              <p className="text-white/40 text-lg mb-2">Start a conversation</p>
              <p className="text-white/30 text-sm max-w-sm">
                Type a message below or use the microphone to speak.
                {selectedVectorStore && " I'll use your knowledge base to provide accurate answers."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`rounded-2xl px-4 py-3 max-w-[80%] ${
                      message.role === 'user'
                        ? 'bg-blue-500/30 text-white border border-blue-400/20'
                        : 'bg-white/10 text-white/90 border border-white/10'
                    }`}
                  >
                    <div className="prose prose-sm prose-invert max-w-none">
                      {message.parts.map((part, i) => (
                        part.type === 'text' ? (
                          <ReactMarkdown
                            key={i}
                            components={{
                              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                              ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                              li: ({ children }) => <li className="text-sm">{children}</li>,
                              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                              em: ({ children }) => <em className="italic">{children}</em>,
                              code: ({ children }) => (
                                <code className="bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
                              ),
                              pre: ({ children }) => (
                                <pre className="bg-white/10 p-3 rounded-lg overflow-x-auto my-2 text-xs">{children}</pre>
                              ),
                              h1: ({ children }) => <h1 className="text-lg font-semibold mb-2">{children}</h1>,
                              h2: ({ children }) => <h2 className="text-base font-semibold mb-2">{children}</h2>,
                              h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
                              blockquote: ({ children }) => (
                                <blockquote className="border-l-2 border-white/30 pl-3 italic my-2">{children}</blockquote>
                              ),
                              a: ({ href, children }) => (
                                <a href={href} className="text-blue-300 hover:text-blue-200 underline" target="_blank" rel="noopener noreferrer">{children}</a>
                              ),
                            }}
                          >
                            {part.text}
                          </ReactMarkdown>
                        ) : null
                      ))}
                    </div>
                    {message.role === 'assistant' && message.parts[0].text && (
                      <button
                        onClick={() => {
                          const text = message.parts
                            .filter((part) => part.type === 'text')
                            .map((part) => part.text)
                            .join('');
                          speakText(text);
                        }}
                        disabled={isSpeaking}
                        className="mt-2 flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors disabled:opacity-50"
                      >
                        <Volume2 className="w-3 h-3" />
                        <span>Speak</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-4 py-3 bg-white/10 border border-white/10">
                    <p className="text-white/50 text-sm">
                      {selectedVectorStore ? 'Searching knowledge base...' : 'Thinking...'}
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex justify-center">
                  <div className="rounded-xl px-4 py-2 bg-red-500/10 border border-red-500/20">
                    <p className="text-red-300 text-sm">Error: {error}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status Indicators */}
        {(isRecording || isTranscribing || isSpeaking) && (
          <div className="flex justify-center mb-3">
            <div className={`px-4 py-2 rounded-full text-sm ${
              isRecording ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
              isTranscribing ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
              'bg-blue-500/20 text-blue-300 border border-blue-500/30'
            }`}>
              {isRecording && '🎙️ Recording...'}
              {isTranscribing && '✨ Transcribing...'}
              {isSpeaking && '🔊 Speaking...'}
            </div>
          </div>
        )}

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="flex gap-3">
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isLoading}
            className={`p-3 rounded-full transition-all duration-300 ${
              isRecording
                ? 'bg-red-500/30 border border-red-400/30 text-red-300'
                : 'bg-white/5 border border-white/10 text-white/60 hover:text-white/80 hover:bg-white/10'
            }`}
          >
            <Mic className="w-5 h-5" />
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1 bg-white/5 border border-white/10 rounded-full px-5 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/20 focus:bg-white/10 transition-all"
          />

          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="p-3 rounded-full bg-blue-500/30 border border-blue-400/30 text-blue-300 hover:bg-blue-500/40 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-white/30 text-xs mt-4">
          Type to chat • Click mic to dictate
        </p>
      </div>
    </div>
  );
}
