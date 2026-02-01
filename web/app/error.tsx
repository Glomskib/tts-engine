'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { RefreshCw, Home, AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error for debugging (in production, send to error tracking service)
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Simple header */}
      <header className="p-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <Image
            src="/FFAI.png"
            alt="FlashFlow AI"
            width={32}
            height={32}
            className="rounded-lg"
          />
          <span className="font-semibold text-zinc-100">FlashFlow AI</span>
        </Link>
      </header>

      {/* Error content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          {/* Error icon */}
          <div className="mb-8 flex justify-center">
            <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <AlertTriangle size={40} className="text-red-500" />
            </div>
          </div>

          {/* Message */}
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Something went wrong
          </h1>
          <p className="text-zinc-400 mb-4 leading-relaxed">
            We encountered an unexpected error. This has been logged and we&apos;ll look into it.
          </p>

          {/* Error details (only in development or with digest) */}
          {(process.env.NODE_ENV === 'development' || error.digest) && (
            <div className="mb-8 p-4 rounded-lg bg-zinc-900/50 border border-white/5 text-left">
              <p className="text-xs text-zinc-500 mb-1">Error details:</p>
              <p className="text-sm text-zinc-400 font-mono break-all">
                {error.message || 'Unknown error'}
              </p>
              {error.digest && (
                <p className="text-xs text-zinc-600 mt-2">
                  Reference: {error.digest}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-zinc-900 font-semibold hover:bg-zinc-100 transition-colors"
            >
              <RefreshCw size={18} />
              Try Again
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/10 text-zinc-300 font-medium hover:bg-white/5 transition-colors"
            >
              <Home size={18} />
              Go Home
            </Link>
          </div>
        </div>
      </main>

      {/* Simple footer */}
      <footer className="p-6 text-center text-sm text-zinc-600">
        If this keeps happening,{' '}
        <a href="mailto:support@flashflow.ai" className="text-zinc-400 hover:text-white transition-colors">
          contact support
        </a>
      </footer>
    </div>
  );
}
