'use client';

import { useState } from 'react';
import { Phone, PhoneOff, Mic, BookOpen } from 'lucide-react';
import { useRealtime } from '@/lib/hooks/use-realtime';

export default function RealtimeChat() {
  const {
    status,
    activityState,
    transcript,
    sources,
    searchStatus,
    error,
    connect,
    disconnect,
  } = useRealtime();

  const getStatusText = () => {
    if (status === 'connecting') return 'Connecting...';
    if (status === 'error') return 'Connection error';
    if (status === 'disconnected') return 'Disconnected';
    if (activityState === 'listening') return 'Listening...';
    if (activityState === 'searching') return 'Searching knowledge base...';
    if (activityState === 'thinking') return 'Thinking...';
    if (activityState === 'speaking') return 'Speaking...';
    return 'Ready to listen';
  };

  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Pine green gradient background */}
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

        {/* Buttons */}
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

        {error && (
          <div className="mt-4 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Sources panel */}
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
                    className={`text-sm ${entry.role === 'user' ? 'text-green-300/80' : 'text-white/70'}`}
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

        <p className="fixed bottom-4 text-white/30 text-xs">
          {status === 'connected' ? 'Speak naturally • Interrupt anytime' : ''}
        </p>
      </div>
    </div>
  );
}
