'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { RefreshCw, ArrowRight, AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[FlashFlow] Unhandled error:', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col">
      {/* Header */}
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

      {/* Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          {/* Icon */}
          <div className="mb-8 flex justify-center">
            <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <AlertTriangle size={36} className="text-red-400" />
            </div>
          </div>

          {/* Message */}
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            Something went wrong
          </h1>
          <p className="text-zinc-400 mb-4 leading-relaxed">
            We hit an unexpected error. This has been logged and we&apos;ll look into it.
          </p>

          {/* Error reference (production-safe) */}
          {error.digest && (
            <div className="mb-8 px-4 py-3 rounded-lg bg-zinc-900/60 border border-white/5 inline-block">
              <p className="text-xs text-zinc-500">
                Reference: <span className="font-mono text-zinc-400">{error.digest}</span>
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-zinc-900 font-semibold hover:bg-zinc-100 transition-colors"
            >
              Try Again
              <RefreshCw size={16} />
            </button>
            <Link
              href="/my-tasks"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/10 text-zinc-300 font-medium hover:bg-white/5 transition-colors"
            >
              Go to Dashboard
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-sm text-zinc-600">
        If this keeps happening,{' '}
        <a
          href="mailto:support@flashflow.ai"
          className="text-zinc-400 hover:text-white transition-colors"
        >
          contact support
        </a>
      </footer>
    </div>
  );
}
