'use client';

import Image from 'next/image';

export default function Loading() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center space-y-6">
        {/* Animated Logo */}
        <div className="relative w-24 h-24 mx-auto">
          <div className="absolute inset-0 bg-teal-500/20 rounded-full blur-xl animate-pulse" />
          <Image
            src="/logo.svg"
            alt="FlashFlow AI"
            width={96}
            height={96}
            className="relative animate-bounce"
            priority
          />
        </div>

        {/* Loading Text */}
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-white">FlashFlow AI</h2>
          <p className="text-zinc-400 text-sm">Loading...</p>
        </div>

        {/* Spinner */}
        <div className="flex items-center justify-center gap-2">
          <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" />
          <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
          <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    </div>
  );
}
