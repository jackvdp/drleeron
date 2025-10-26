'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Mic, Send, Volume2, Database, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  const [vectorStores, setVectorStores] = useState<VectorStore[]>([]);
  const [selectedVectorStore, setSelectedVectorStore] = useState<string | null>(null);
  const [loadingVectorStores, setLoadingVectorStores] = useState(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load vector stores on mount
  useEffect(() => {
    loadVectorStores();
  }, []);

  const loadVectorStores = async () => {
    try {
      setLoadingVectorStores(true);
      const response = await fetch('/api/vector-store');
      const data = await response.json();
      setVectorStores(data.vectorStores || []);
    } catch (error) {
      console.error('Error loading vector stores:', error);
    } finally {
      setLoadingVectorStores(false);
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
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check permissions.');
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
  const transcribeAudio = async (audioBlob: Blob) => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.text) {
        setInput(data.text);
      }
    } catch (error) {
      console.error('Error transcribing audio:', error);
    }
  };

  // Speak the AI's response
  const speakText = async (text: string) => {
    setIsSpeaking(true);
    try {
      const response = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };

      audio.play();
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsSpeaking(false);
    }
  };

  // Send message and handle TRUE streaming from API route
  const sendMessage = async (userMessage: string) => {
    if (!userMessage.trim()) return;

    setIsLoading(true);
    setError(null);

    // Add user message
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      parts: [{ type: 'text', text: userMessage }],
    };
    setMessages((prev) => [...prev, userMsg]);

    // Create placeholder for assistant message
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

      // Read the TRUE streaming response from OpenAI
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

              // Update the assistant message with streamed text
              setMessages((prev) =>
                  prev.map((msg) =>
                      msg.id === assistantMsgId
                          ? {
                            ...msg,
                            parts: [{ type: 'text', text: accumulatedText }],
                          }
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
      // Remove the placeholder assistant message on error
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

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  return (
      <div className="flex flex-col h-screen max-w-4xl mx-auto p-4">
        <Card className="flex-1 flex flex-col">
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">Dr Leeron</h1>
              <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.href = '/vector-store'}
              >
                <Database className="h-4 w-4 mr-2" />
                Manage Knowledge Base
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Select
                  value={selectedVectorStore || 'none'}
                  onValueChange={(value) => setSelectedVectorStore(value === 'none' ? null : value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select knowledge base (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No knowledge base</SelectItem>
                  {vectorStores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedVectorStore && (
                  <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedVectorStore(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
              )}
            </div>

            {selectedVectorStore && (
                <div className="text-xs text-muted-foreground bg-muted px-3 py-2 rounded-md">
                  <Database className="h-3 w-3 inline mr-1" />
                  AI will search the knowledge base to answer your questions
                </div>
            )}
          </div>

          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.length === 0 && (
                  <div className="text-center text-muted-foreground py-12">
                    <p className="text-lg mb-2">👋 Hello! I'm Dr. Leeron</p>
                    <p className="text-sm">
                      Ask me anything about medicine or medical concepts.
                      {selectedVectorStore && (
                          <span className="block mt-2">
                      I'll use your knowledge base to provide accurate answers.
                    </span>
                      )}
                    </p>
                  </div>
              )}

              {messages.map((message) => (
                  <div
                      key={message.id}
                      className={`flex gap-3 ${
                          message.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                  >
                    {message.role === 'assistant' && (
                        <Avatar>
                          <AvatarFallback>AI</AvatarFallback>
                        </Avatar>
                    )}

                    <div
                        className={`rounded-lg px-4 py-2 max-w-[80%] ${
                            message.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                        }`}
                    >
                      <p className="whitespace-pre-wrap">
                        {message.parts.map((part, i) => {
                          if (part.type === 'text') {
                            return <span key={i}>{part.text}</span>;
                          }
                          return null;
                        })}
                      </p>
                      {message.role === 'assistant' && message.parts[0].text && (
                          <Button
                              size="sm"
                              variant="ghost"
                              className="mt-2"
                              onClick={() => {
                                const text = message.parts
                                    .filter((part) => part.type === 'text')
                                    .map((part) => part.text)
                                    .join('');
                                speakText(text);
                              }}
                              disabled={isSpeaking}
                          >
                            <Volume2 className="h-4 w-4 mr-2" />
                            Speak
                          </Button>
                      )}
                    </div>

                    {message.role === 'user' && (
                        <Avatar>
                          <AvatarFallback>You</AvatarFallback>
                        </Avatar>
                    )}
                  </div>
              ))}

              {isLoading && (
                  <div className="flex gap-3 justify-start">
                    <Avatar>
                      <AvatarFallback>AI</AvatarFallback>
                    </Avatar>
                    <div className="rounded-lg px-4 py-2 bg-muted">
                      <p className="text-muted-foreground">
                        {selectedVectorStore ? 'Searching knowledge base...' : 'Thinking...'}
                      </p>
                    </div>
                  </div>
              )}

              {error && (
                  <div className="flex justify-center">
                    <div className="rounded-lg px-4 py-2 bg-destructive/10 text-destructive">
                      <p>Error: {error}</p>
                    </div>
                  </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-4 border-t">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Button
                  type="button"
                  size="icon"
                  variant={isRecording ? "destructive" : "outline"}
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isLoading}
              >
                <Mic className="h-4 w-4" />
              </Button>

              <Input
                  value={input}
                  onChange={handleInputChange}
                  placeholder="Type or speak your message..."
                  className="flex-1"
                  disabled={isLoading}
              />

              <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>

            {isRecording && (
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  Recording... Click mic again to stop
                </p>
            )}
          </div>
        </Card>
      </div>
  );
}