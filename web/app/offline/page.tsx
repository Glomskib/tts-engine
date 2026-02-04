'use client';

import { WifiOff, RefreshCw } from 'lucide-react';
import Image from 'next/image';

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
      {/* Logo */}
      <Image
        src="/FFAI.png"
        alt="FlashFlow AI"
        width={64}
        height={64}
        className="rounded-xl mb-6 opacity-50"
      />

      {/* Icon */}
      <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center mb-6">
        <WifiOff className="w-10 h-10 text-zinc-500" />
      </div>

      {/* Message */}
      <h1 className="text-2xl font-bold text-white mb-3">You&apos;re Offline</h1>
      <p className="text-zinc-400 max-w-sm mb-8">
        FlashFlow AI needs an internet connection to work. Please check your connection and try again.
      </p>

      {/* Retry button */}
      <button type="button"
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 h-12 px-6 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 active:bg-teal-800 transition-colors btn-press"
      >
        <RefreshCw className="w-5 h-5" />
        Try Again
      </button>

      {/* Tips */}
      <div className="mt-12 text-sm text-zinc-500 max-w-xs">
        <p className="mb-2">Troubleshooting tips:</p>
        <ul className="text-left space-y-1">
          <li>• Check your Wi-Fi connection</li>
          <li>• Try toggling airplane mode</li>
          <li>• Move closer to your router</li>
        </ul>
      </div>
    </div>
  );
}
