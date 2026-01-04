'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface TranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

interface GroundingSource {
  id?: string;
  title: string;
  excerpt?: string;
}

interface SearchStatus {
  query: string;
  resultCount: number;
  timestamp: Date;
}

export default function RealtimeChat() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [searchStatus, setSearchStatus] = useState<SearchStatus | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackTimeRef = useRef<number>(0);
  const activeAudioSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // Connect to the WebSocket server
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    setError(null);

    try {
      // Initialize audio context
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });

      // Get microphone access
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Connect to our WebSocket proxy
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/realtime`;
      console.log('Connecting to WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to realtime server');
        setStatus('connected');
        startAudioCapture();
      };

      ws.onmessage = (event) => {
        handleServerMessage(JSON.parse(event.data));
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        setError('Connection error - check console for details');
        setStatus('error');
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setStatus('disconnected');
        stopAudioCapture();
      };
    } catch (err) {
      console.error('Failed to connect:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setStatus('error');
    }
  }, []);

  // Disconnect from the WebSocket server
  const disconnect = useCallback(() => {
    stopAudioCapture();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setStatus('disconnected');
    setIsListening(false);
    setIsSpeaking(false);
  }, []);

  // Start capturing audio from microphone
  const startAudioCapture = useCallback(() => {
    if (!audioContextRef.current || !mediaStreamRef.current || !wsRef.current) return;

    const audioContext = audioContextRef.current;
    const source = audioContext.createMediaStreamSource(mediaStreamRef.current);

    // Use ScriptProcessorNode to capture raw PCM data
    // Note: ScriptProcessorNode is deprecated but AudioWorklet requires more setup
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);

      // Convert Float32 to Int16 PCM
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Convert to base64 and send
      const base64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));

      wsRef.current.send(
        JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64,
        })
      );
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
    setIsListening(true);
  }, []);

  // Stop all currently playing audio (for interruption/barge-in)
  const stopAllAudio = useCallback(() => {
    // Stop all active audio sources
    activeAudioSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Ignore errors if already stopped
      }
    });
    activeAudioSourcesRef.current = [];
    
    // Reset playback time to now
    if (audioContextRef.current) {
      playbackTimeRef.current = audioContextRef.current.currentTime;
    }
    
    setIsSpeaking(false);
  }, []);

  // Send cancel response to server (to stop AI from generating more)
  const cancelResponse = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'response.cancel' }));
    }
  }, []);

  // Stop capturing audio
  const stopAudioCapture = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setIsListening(false);
  }, []);

  // Handle messages from the server
  const handleServerMessage = useCallback((event: Record<string, unknown>) => {
    const eventType = event.type as string;

    switch (eventType) {
      case 'session.created':
        console.log('Session created');
        break;

      case 'session.updated':
        console.log('Session updated');
        break;

      case 'input_audio_buffer.speech_started':
        console.log('User started speaking');
        setIsListening(true);
        
        // BARGE-IN: Stop AI audio and cancel response when user starts speaking
        stopAllAudio();
        cancelResponse();
        
        // Clear sources and search status for new conversation turn
        setSources([]);
        setSearchStatus(null);
        setIsSearching(false);
        setIsThinking(false);
        break;

      case 'input_audio_buffer.speech_stopped':
        console.log('User stopped speaking');
        // User finished speaking - AI will start thinking
        setIsThinking(true);
        break;

      case 'input_audio_buffer.committed':
        // Audio was committed for processing
        setIsThinking(true);
        break;

      case 'response.created':
        // Response is being generated - might be searching
        setIsSearching(true);
        setIsThinking(true);
        break;

      case 'search.completed':
        // Search completed - show status
        setIsSearching(false);
        setSearchStatus({
          query: event.query as string,
          resultCount: event.resultCount as number,
          timestamp: new Date(),
        });
        console.log(`Search completed: ${event.resultCount} results for "${event.query}"`);
        break;

      case 'conversation.item.input_audio_transcription.completed':
        // User's speech was transcribed
        const userText = event.transcript as string;
        if (userText) {
          setTranscript((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'user',
              text: userText,
              timestamp: new Date(),
            },
          ]);
        }
        break;

      case 'response.audio_transcript.delta':
        // Assistant is speaking - update transcript
        // This comes in chunks, we'd need to accumulate
        break;

      case 'response.audio_transcript.done':
        // Assistant finished a transcript segment
        const assistantText = event.transcript as string;
        if (assistantText) {
          setTranscript((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              text: assistantText,
              timestamp: new Date(),
            },
          ]);
        }
        break;

      case 'response.audio.delta':
        // Audio chunk from assistant - play it
        playAudioChunk(event.delta as string);
        setIsSpeaking(true);
        setIsThinking(false); // No longer thinking once audio starts
        break;

      case 'response.audio.done':
        setIsSpeaking(false);
        setIsSearching(false);
        setIsThinking(false);
        break;

      case 'response.done':
        setIsSpeaking(false);
        setIsSearching(false);
        setIsThinking(false);
        break;

      case 'response.cancelled':
        // Response was cancelled (e.g., due to barge-in)
        console.log('Response cancelled');
        setIsSpeaking(false);
        setIsSearching(false);
        setIsThinking(false);
        break;

      case 'grounding.sources':
        // Received grounding/citation info from server
        const groundingSources = event.sources as GroundingSource[];
        if (groundingSources && groundingSources.length > 0) {
          setSources((prev) => [...prev, ...groundingSources]);
        }
        break;

      case 'error':
        console.error('Server error:', event);
        setError((event.error as { message?: string })?.message || 'Unknown error');
        break;

      default:
        // Log unhandled events for debugging
        if (!eventType.includes('delta')) {
          console.log('Unhandled event:', eventType, event);
        }
    }
  }, [stopAllAudio, cancelResponse]);

  // Play audio chunk received from the server
  const playAudioChunk = useCallback((base64Audio: string) => {
    if (!audioContextRef.current) return;

    try {
      // Decode base64 to binary
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert to Int16 then Float32
      const int16Data = new Int16Array(bytes.buffer);
      const float32Data = new Float32Array(int16Data.length);
      for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768;
      }

      // Create audio buffer and play
      const audioBuffer = audioContextRef.current.createBuffer(1, float32Data.length, 24000);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);

      // Track this source for potential interruption
      activeAudioSourcesRef.current.push(source);
      
      // Remove from tracking when done
      source.onended = () => {
        const index = activeAudioSourcesRef.current.indexOf(source);
        if (index > -1) {
          activeAudioSourcesRef.current.splice(index, 1);
        }
      };

      // Schedule playback
      const startTime = Math.max(playbackTimeRef.current, audioContextRef.current.currentTime);
      source.start(startTime);
      playbackTimeRef.current = startTime + audioBuffer.duration;
    } catch (err) {
      console.error('Error playing audio:', err);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4">
      <Card className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Dr Leeron</h1>
              <p className="text-sm text-muted-foreground">Realtime Voice Chat</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={status === 'connected' ? 'default' : 'outline'}
                onClick={status === 'connected' ? disconnect : connect}
                disabled={status === 'connecting'}
              >
                {status === 'connected' ? (
                  <>
                    <PhoneOff className="h-4 w-4 mr-2" />
                    End Call
                  </>
                ) : status === 'connecting' ? (
                  'Connecting...'
                ) : (
                  <>
                    <Phone className="h-4 w-4 mr-2" />
                    Start Call
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Status indicators */}
        <div className="px-4 py-2 border-b bg-muted/50">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  status === 'connected'
                    ? 'bg-green-500'
                    : status === 'connecting'
                    ? 'bg-yellow-500 animate-pulse'
                    : status === 'error'
                    ? 'bg-red-500'
                    : 'bg-gray-400'
                }`}
              />
              <span className="capitalize">{status}</span>
            </div>

            {status === 'connected' && (
              <>
                <div className="flex items-center gap-2">
                  {isListening ? (
                    <Mic className="h-4 w-4 text-green-500" />
                  ) : (
                    <MicOff className="h-4 w-4 text-gray-400" />
                  )}
                  <span>{isListening ? 'Listening' : 'Not listening'}</span>
                </div>

                {isSpeaking && (
                  <div className="flex items-center gap-2">
                    <span className="text-blue-500">🔊 Speaking...</span>
                  </div>
                )}

                {isThinking && !isSpeaking && !isSearching && (
                  <div className="flex items-center gap-2">
                    <span className="text-purple-500 animate-pulse">🧠 Thinking...</span>
                  </div>
                )}

                {isSearching && (
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-500 animate-pulse">🔍 Searching knowledge base...</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Search status */}
          {searchStatus && (
            <div className="mt-2 text-xs text-muted-foreground">
              Found {searchStatus.resultCount} results for "{searchStatus.query}"
            </div>
          )}
        </div>

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto p-4">
          {transcript.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              {status === 'connected' ? (
                <p>Start speaking to begin the conversation...</p>
              ) : (
                <p>Click "Start Call" to begin a voice conversation with Dr. Leeron</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {transcript.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`rounded-lg px-4 py-2 max-w-[80%] ${
                      entry.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p>{entry.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sources/Citations */}
        {sources.length > 0 && (
          <div className="px-4 py-3 border-t bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              📚 Sources ({sources.length}):
            </p>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {sources.map((source, i) => (
                <div
                  key={source.id || i}
                  className="text-xs bg-background px-3 py-2 rounded border"
                >
                  <div className="font-medium text-foreground">{source.title}</div>
                  {source.excerpt && (
                    <div className="text-muted-foreground mt-1 line-clamp-2">
                      "{source.excerpt}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="px-4 py-2 border-t bg-destructive/10 text-destructive">
            <p className="text-sm">Error: {error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t">
          <p className="text-center text-sm text-muted-foreground">
            {status === 'connected'
              ? 'Speak naturally - the AI will respond when you pause. Start speaking to interrupt.'
              : 'Connect to start a voice conversation'}
          </p>
        </div>
      </Card>
    </div>
  );
}
