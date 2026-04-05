'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type ActivityState = 'idle' | 'listening' | 'speaking' | 'thinking' | 'searching';

export interface TranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export interface GroundingSource {
  id?: string;
  title: string;
  excerpt?: string;
}

export interface SearchStatus {
  query: string;
  resultCount: number;
  timestamp: Date;
}

interface RealtimeEvent {
  type: string;
  [key: string]: unknown;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useRealtime(vectorStoreId?: string | null) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [searchStatus, setSearchStatus] = useState<SearchStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackTimeRef = useRef<number>(0);
  const activeAudioSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // ─── Derived state ───────────────────────────────────────────────────────

  const activityState: ActivityState = isListening
    ? 'listening'
    : isSpeaking
    ? 'speaking'
    : isSearching
    ? 'searching'
    : isThinking
    ? 'thinking'
    : 'idle';

  // ─── Search via server action (called from API route) ────────────────────

  const executeSearch = useCallback(async (query: string): Promise<object> => {
    try {
      const response = await fetch('/api/realtime/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, vectorStoreId }),
      });
      return await response.json();
    } catch (err) {
      console.error('Search failed:', err);
      return { success: false, error: 'Search failed', results: [] };
    }
  }, [vectorStoreId]);

  // ─── Handle function calls from OpenAI ───────────────────────────────────

  const handleFunctionCall = useCallback(
    async (event: RealtimeEvent) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const callId = event.call_id as string;
      const name = event.name as string;
      const args = JSON.parse(event.arguments as string);

      let result: object;

      if (name === 'search') {
        setIsSearching(true);
        result = await executeSearch(args.query);
        setIsSearching(false);

        const searchResult = result as { resultCount?: number };
        setSearchStatus({
          query: args.query,
          resultCount: searchResult.resultCount || 0,
          timestamp: new Date(),
        });
      } else if (name === 'report_grounding') {
        const groundingSources = (args.sources || []).map(
          (source: { title: string; excerpt?: string }, index: number) => ({
            id: `source-${Date.now()}-${index}`,
            title: source.title || 'Unknown Document',
            excerpt: source.excerpt || '',
          })
        );
        setSources((prev) => [...prev, ...groundingSources]);
        result = { success: true, sourcesReported: groundingSources.length };
      } else {
        result = { error: `Unknown function: ${name}` };
      }

      // Send function output back to OpenAI
      ws.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify(result),
          },
        })
      );

      // Trigger response generation with audio
      ws.send(
        JSON.stringify({
          type: 'response.create',
          response: { modalities: ['text', 'audio'] },
        })
      );
    },
    [executeSearch]
  );

  // ─── Audio capture ───────────────────────────────────────────────────────

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
        JSON.stringify({ type: 'input_audio_buffer.append', audio: base64 })
      );
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
    setIsListening(true);
  }, []);

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

  // ─── Audio playback ──────────────────────────────────────────────────────

  const stopAllAudio = useCallback(() => {
    activeAudioSourcesRef.current.forEach((source) => {
      try { source.stop(); } catch { /* already stopped */ }
    });
    activeAudioSourcesRef.current = [];
    if (audioContextRef.current) {
      playbackTimeRef.current = audioContextRef.current.currentTime;
    }
    setIsSpeaking(false);
  }, []);

  const cancelResponse = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'response.cancel' }));
    }
  }, []);

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

      activeAudioSourcesRef.current.push(source);
      source.onended = () => {
        const index = activeAudioSourcesRef.current.indexOf(source);
        if (index > -1) activeAudioSourcesRef.current.splice(index, 1);
      };

      const startTime = Math.max(playbackTimeRef.current, audioContextRef.current.currentTime);
      source.start(startTime);
      playbackTimeRef.current = startTime + audioBuffer.duration;
    } catch (err) {
      console.error('Error playing audio:', err);
    }
  }, []);

  // ─── WebSocket message handler ───────────────────────────────────────────

  const handleServerMessage = useCallback(
    (event: Record<string, unknown>) => {
      const eventType = event.type as string;

      switch (eventType) {
        case 'session.created':
        case 'session.updated':
          break;

        case 'input_audio_buffer.speech_started':
          setIsListening(true);
          if (isSpeaking || isThinking) {
            stopAllAudio();
            cancelResponse();
          }
          setSources([]);
          setSearchStatus(null);
          setIsSearching(false);
          setIsThinking(false);
          break;

        case 'input_audio_buffer.speech_stopped':
          setIsThinking(true);
          break;

        case 'input_audio_buffer.committed':
          setIsThinking(true);
          break;

        case 'response.created':
          setIsSearching(true);
          setIsThinking(true);
          break;

        case 'conversation.item.input_audio_transcription.completed': {
          const userText = event.transcript as string;
          if (userText) {
            setTranscript((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: 'user', text: userText, timestamp: new Date() },
            ]);
          }
          break;
        }

        case 'response.audio_transcript.done': {
          const assistantText = event.transcript as string;
          if (assistantText) {
            setTranscript((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: 'assistant', text: assistantText, timestamp: new Date() },
            ]);
          }
          break;
        }

        case 'response.audio.delta':
          playAudioChunk(event.delta as string);
          setIsSpeaking(true);
          setIsThinking(false);
          break;

        case 'response.audio.done':
        case 'response.done':
          setIsSpeaking(false);
          setIsSearching(false);
          setIsThinking(false);
          break;

        case 'response.cancelled':
          setIsSpeaking(false);
          setIsSearching(false);
          setIsThinking(false);
          break;

        case 'error': {
          const errorMessage = (event.error as { message?: string })?.message || 'Unknown error';
          if (!errorMessage.includes('no active response')) {
            console.error('Realtime error:', errorMessage);
            setError(errorMessage);
          }
          break;
        }

        // Normal lifecycle events — no action needed
        case 'conversation.item.created':
        case 'response.output_item.added':
        case 'response.output_item.done':
        case 'response.content_part.added':
        case 'response.content_part.done':
        case 'response.audio_transcript.delta':
        case 'rate_limits.updated':
        case 'conversation.item.input_audio_transcription.failed':
          break;

        default:
          if (!eventType.includes('delta')) {
            console.log('Unhandled event:', eventType);
          }
      }
    },
    [isSpeaking, isThinking, stopAllAudio, cancelResponse, playAudioChunk]
  );

  // ─── Connect ─────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    setError(null);

    try {
      // Audio context (requires user gesture in Chrome)
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      await audioContextRef.current.resume();

      // Microphone
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });

      // Ephemeral token
      const tokenResponse = await fetch('/api/realtime', { method: 'POST' });
      if (!tokenResponse.ok) throw new Error('Failed to get session token');
      const session = await tokenResponse.json();
      const ephemeralKey = session.client_secret?.value;
      if (!ephemeralKey) throw new Error('No ephemeral key in session response');

      // WebSocket to OpenAI
      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
        ['realtime', `openai-insecure-api-key.${ephemeralKey}`, 'openai-beta.realtime-v1']
      );
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        startAudioCapture();
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'response.function_call_arguments.done') {
          handleFunctionCall(data);
          return;
        }
        handleServerMessage(data);
      };

      ws.onerror = () => {
        setError('Connection error');
        setStatus('error');
      };

      ws.onclose = () => {
        setStatus('disconnected');
        stopAudioCapture();
      };
    } catch (err) {
      console.error('Failed to connect:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setStatus('error');
    }
  }, [handleFunctionCall, handleServerMessage, startAudioCapture, stopAudioCapture]);

  // ─── Disconnect ──────────────────────────────────────────────────────────

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
  }, [stopAudioCapture]);

  // ─── Cleanup on unmount ──────────────────────────────────────────────────

  useEffect(() => {
    return () => { disconnect(); };
  }, [disconnect]);

  // ─── Public API ──────────────────────────────────────────────────────────

  return {
    // State
    status,
    activityState,
    transcript,
    sources,
    searchStatus,
    error,
    isListening,
    isSpeaking,
    isSearching,
    isThinking,

    // Actions
    connect,
    disconnect,
  };
}
