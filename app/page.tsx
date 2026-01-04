'use client';

import { MessageSquare, Phone } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Purple gradient background */}
      <div 
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(
              ellipse at 50% 50%,
              rgba(88, 60, 120, 1) 0%,
              rgba(65, 45, 95, 1) 35%,
              rgba(50, 35, 75, 1) 60%,
              rgba(38, 28, 60, 1) 80%,
              rgba(28, 20, 48, 1) 100%
            )
          `,
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4">
        
        {/* Title */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-light text-white/90 tracking-wide mb-4">Dr Leeron</h1>
          <p className="text-white/50 text-lg mb-4">RANZCP MEQ Exam Tutor</p>
          <p className="text-white/40 text-sm max-w-lg mx-auto leading-relaxed">
            Prepare for your RANZCP MEQ exam with AI-powered Socratic questioning. 
            Choose your preferred way to learn below.
          </p>
        </div>

        {/* Mode Selection Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-2xl w-full px-4">
          
          {/* Voice Chat Card */}
          <Link href="/realtime" className="group">
            <div className="relative p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm transition-all duration-500 hover:bg-white/10 hover:border-white/20 hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20">
              {/* Glow effect */}
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-green-500/0 to-green-500/0 group-hover:from-green-500/10 group-hover:to-transparent transition-all duration-500" />
              
              <div className="relative">
                {/* Icon */}
                <div className="w-16 h-16 rounded-2xl bg-green-500/20 border border-green-500/30 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <Phone className="w-8 h-8 text-green-400" />
                </div>
                
                {/* Title */}
                <h2 className="text-2xl font-medium text-white mb-3">Voice Conversation</h2>
                
                {/* Description */}
                <p className="text-white/50 text-sm leading-relaxed mb-4">
                  Have a natural voice conversation with Dr Leeron. Speak your questions and hear responses in real-time.
                </p>
                
                {/* Features */}
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-300 text-xs">
                    Real-time
                  </span>
                  <span className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-300 text-xs">
                    Hands-free
                  </span>
                  <span className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-300 text-xs">
                    Natural Speech
                  </span>
                </div>
              </div>
            </div>
          </Link>

          {/* Text Chat Card */}
          <Link href="/text" className="group">
            <div className="relative p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm transition-all duration-500 hover:bg-white/10 hover:border-white/20 hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20">
              {/* Glow effect */}
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-blue-500/0 to-blue-500/0 group-hover:from-blue-500/10 group-hover:to-transparent transition-all duration-500" />
              
              <div className="relative">
                {/* Icon */}
                <div className="w-16 h-16 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <MessageSquare className="w-8 h-8 text-blue-400" />
                </div>
                
                {/* Title */}
                <h2 className="text-2xl font-medium text-white mb-3">Text Chat</h2>
                
                {/* Description */}
                <p className="text-white/50 text-sm leading-relaxed mb-4">
                  Type your questions and receive detailed written responses. Great for reviewing and taking notes.
                </p>
                
                {/* Features */}
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs">
                    Markdown
                  </span>
                  <span className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs">
                    Copy & Paste
                  </span>
                  <span className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs">
                    Voice Input
                  </span>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Footer */}
        <p className="mt-12 text-white/30 text-xs text-center">
          Powered by AI • Built for RANZCP exam preparation
        </p>
      </div>
    </div>
  );
}
