'use client';

import Image from 'next/image';

export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center space-y-6">
        {/* Animated Logo */}
        <div className="relative w-20 h-20 mx-auto">
          <div className="absolute inset-0 bg-teal-500/20 rounded-full blur-xl animate-pulse" />
          <Image
            src="/logo.svg"
            alt="FlashFlow AI"
            width={80}
            height={80}
            className="relative animate-bounce"
            priority
          />
        </div>

        {/* Loading Text */}
        <div className="space-y-1">
          <p className="text-zinc-400 text-sm">Loading dashboard...</p>
        </div>

        {/* Progress Bar */}
        <div className="w-48 mx-auto h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    </div>
  );
}
