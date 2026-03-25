'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Phone, PhoneOff, Mic, BookOpen } from 'lucide-react';

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
  const [showTranscript, setShowTranscript] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackTimeRef = useRef<number>(0);
  const activeAudioSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const hasConnectedRef = useRef(false);

  // Get the current activity state for the orb
  const getActivityState = () => {
    if (isListening) return 'listening';
    if (isSpeaking) return 'speaking';
    if (isSearching) return 'searching';
    if (isThinking) return 'thinking';
    return 'idle';
  };

  const activityState = getActivityState();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (!hasConnectedRef.current) {
      hasConnectedRef.current = true;
      connect();
    }
  }, [connect]);

  // Start capturing audio from microphone
  const startAudioCapture = useCallback(() => {
    if (!audioContextRef.current || !mediaStreamRef.current || !wsRef.current) return;

    const audioContext = audioContextRef.current;
    const source = audioContext.createMediaStreamSource(mediaStreamRef.current);

    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);

      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

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

  // Play audio chunk received from the server
  const playAudioChunk = useCallback((base64Audio: string) => {
    if (!audioContextRef.current) return;

    try {
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const int16Data = new Int16Array(bytes.buffer);
      const float32Data = new Float32Array(int16Data.length);
      for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768;
      }

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
        setIsSearching(false);
        setSearchStatus({
          query: event.query as string,
          resultCount: event.resultCount as number,
          timestamp: new Date(),
        });
        console.log(`Search completed: ${event.resultCount} results for "${event.query}"`);
        break;

      case 'conversation.item.input_audio_transcription.completed':
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

      case 'response.audio_transcript.done':
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
        const groundingSources = event.sources as GroundingSource[];
        if (groundingSources && groundingSources.length > 0) {
          setSources((prev) => [...prev, ...groundingSources]);
        }
        break;

      case 'error':
        console.error('Server error:', event);
        const errorMessage = (event.error as { message?: string })?.message || 'Unknown error';
        if (!errorMessage.includes('no active response')) {
          setError(errorMessage);
        }
        break;

      default:
        if (!eventType.includes('delta')) {
          console.log('Unhandled event:', eventType, event);
        }
    }
  }, [stopAllAudio, cancelResponse, playAudioChunk]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // Status text based on activity
  const getStatusText = () => {
    if (status === 'connecting') return 'Connecting...';
    if (status === 'error') return 'Connection error';
    if (status === 'disconnected') return 'Disconnected';
    if (isListening) return 'Listening...';
    if (isSearching) return 'Searching knowledge base...';
    if (isThinking) return 'Thinking...';
    if (isSpeaking) return 'Speaking...';
    return 'Ready to listen';
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Pine green gradient background with radial lighter center */}
      <div 
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(
              ellipse at 50% 50%,
              rgba(45, 90, 70, 1) 0%,
              rgba(30, 70, 55, 1) 35%,
              rgba(20, 55, 45, 1) 60%,
              rgba(15, 45, 35, 1) 80%,
              rgba(10, 35, 28, 1) 100%
            )
          `,
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4">
        
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-light text-white/90 tracking-wide">Dr Leeron</h1>
          <p className="text-white/50 text-sm mt-2 mb-4">RANZCP MEQ Voice Tutor</p>
          <p className="text-white/40 text-sm max-w-md mx-auto leading-relaxed">
            Practice for your RANZCP MEQ exam with AI-guided Socratic questioning. 
            Speak naturally and I&apos;ll help you work through clinical scenarios.
          </p>
        </div>

        {/* Central Orb */}
        <div className="relative mb-8">
          {/* Outer glow rings */}
          <div 
            className={`absolute inset-0 rounded-full transition-all duration-1000 ${
              activityState === 'listening' ? 'animate-ping' : ''
            }`}
            style={{
              width: '200px',
              height: '200px',
              background: activityState === 'listening' 
                ? 'rgba(134, 239, 172, 0.2)' 
                : activityState === 'speaking'
                ? 'rgba(147, 197, 253, 0.2)'
                : activityState === 'thinking' || activityState === 'searching'
                ? 'rgba(251, 191, 36, 0.15)'
                : 'rgba(255, 255, 255, 0.05)',
              filter: 'blur(40px)',
              transform: 'translate(-50%, -50%)',
              left: '50%',
              top: '50%',
            }}
          />

          {/* Main orb */}
          <div 
            className={`relative w-48 h-48 rounded-full flex items-center justify-center transition-all duration-500 ${
              activityState === 'speaking' ? 'scale-110' : 
              activityState === 'listening' ? 'scale-105' : 
              'scale-100'
            }`}
            style={{
              background: `
                radial-gradient(
                  circle at 30% 30%,
                  rgba(134, 239, 172, 0.3) 0%,
                  rgba(74, 222, 128, 0.15) 30%,
                  rgba(34, 197, 94, 0.1) 60%,
                  rgba(22, 163, 74, 0.05) 100%
                )
              `,
              boxShadow: activityState === 'listening'
                ? '0 0 60px rgba(134, 239, 172, 0.4), inset 0 0 60px rgba(134, 239, 172, 0.1)'
                : activityState === 'speaking'
                ? '0 0 60px rgba(147, 197, 253, 0.4), inset 0 0 60px rgba(147, 197, 253, 0.1)'
                : activityState === 'thinking' || activityState === 'searching'
                ? '0 0 40px rgba(251, 191, 36, 0.3), inset 0 0 40px rgba(251, 191, 36, 0.05)'
                : '0 0 40px rgba(255, 255, 255, 0.1), inset 0 0 40px rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            {/* Inner icon */}
            <div className={`transition-all duration-300 ${
              activityState === 'thinking' || activityState === 'searching' ? 'animate-pulse' : ''
            }`}>
              {activityState === 'listening' ? (
                <Mic className="w-12 h-12 text-green-300/80" />
              ) : activityState === 'speaking' ? (
                <div className="flex items-center gap-1">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1.5 bg-blue-300/80 rounded-full animate-pulse"
                      style={{
                        height: `${20 + Math.random() * 20}px`,
                        animationDelay: `${i * 0.15}s`,
                        animationDuration: '0.5s',
                      }}
                    />
                  ))}
                </div>
              ) : activityState === 'thinking' || activityState === 'searching' ? (
                <div className="w-10 h-10 border-2 border-amber-300/50 border-t-amber-300 rounded-full animate-spin" />
              ) : (
                <Mic className="w-12 h-12 text-white/30" />
              )}
            </div>
          </div>

          {/* Animated rings for speaking */}
          {activityState === 'speaking' && (
            <>
              <div className="absolute inset-0 w-48 h-48 rounded-full border border-blue-300/30 animate-ping" style={{ animationDuration: '1.5s' }} />
              <div className="absolute inset-0 w-48 h-48 rounded-full border border-blue-300/20 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
            </>
          )}
        </div>

        {/* Status text */}
        <div className="text-center mb-8">
          <p className={`text-lg font-light transition-all duration-300 ${
            activityState === 'listening' ? 'text-green-300' :
            activityState === 'speaking' ? 'text-blue-300' :
            activityState === 'thinking' || activityState === 'searching' ? 'text-amber-300' :
            'text-white/60'
          }`}>
            {getStatusText()}
          </p>
          
          {searchStatus && (
            <p className="text-white/40 text-sm mt-2">
              Found {searchStatus.resultCount} results
            </p>
          )}
        </div>

        {/* End call button */}
        {status === 'connected' && (
          <button
            onClick={disconnect}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 transition-all duration-300 hover:scale-105"
          >
            <PhoneOff className="w-5 h-5" />
            <span>End Session</span>
          </button>
        )}

        {status === 'disconnected' && (
          <button
            onClick={connect}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-300 transition-all duration-300 hover:scale-105"
          >
            <Phone className="w-5 h-5" />
            <span>Start Session</span>
          </button>
        )}

        {status === 'error' && (
          <button
            onClick={connect}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 transition-all duration-300 hover:scale-105"
          >
            <Phone className="w-5 h-5" />
            <span>Retry Connection</span>
          </button>
        )}

        {/* Error display */}
        {error && (
          <div className="mt-4 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Sources panel - slides up when available */}
        {sources.length > 0 && (
          <div className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto">
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-4">
              <p className="text-white/60 text-xs font-medium mb-2 flex items-center gap-2">
                <BookOpen className="w-3 h-3" />
                Sources ({sources.length})
              </p>
              <div className="space-y-2 max-h-24 overflow-y-auto">
                {sources.map((source, i) => (
                  <div key={source.id || i} className="text-xs">
                    <span className="text-white/80">{source.title}</span>
                    {source.excerpt && (
                      <span className="text-white/40 ml-2">&ldquo;{source.excerpt.slice(0, 50)}...&rdquo;</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Transcript toggle */}
        <button
          onClick={() => setShowTranscript(!showTranscript)}
          className="fixed top-4 right-4 p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white/80 transition-all duration-300"
        >
          <BookOpen className="w-5 h-5" />
        </button>

        {/* Transcript panel */}
        {showTranscript && (
          <div className="fixed top-16 right-4 w-80 max-h-96 bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-4 overflow-hidden">
            <p className="text-white/60 text-xs font-medium mb-3">Transcript</p>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {transcript.length === 0 ? (
                <p className="text-white/30 text-sm">No conversation yet...</p>
              ) : (
                transcript.map((entry) => (
                  <div
                    key={entry.id}
                    className={`text-sm ${
                      entry.role === 'user' ? 'text-green-300/80' : 'text-white/70'
                    }`}
                  >
                    <span className="text-white/40 text-xs">
                      {entry.role === 'user' ? 'You' : 'Dr Leeron'}:
                    </span>
                    <p className="mt-0.5">{entry.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tip at bottom */}
        <p className="fixed bottom-4 text-white/30 text-xs">
          {status === 'connected' ? 'Speak naturally • Interrupt anytime' : ''}
        </p>
      </div>
    </div>
  );
}
