'use client';

import { Trophy, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface WinnersEmptyStateProps {
  hasScripts?: boolean;
}

export function WinnersEmptyState({ hasScripts = false }: WinnersEmptyStateProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
        <Trophy className="w-8 h-8 text-amber-400" />
      </div>

      <h3 className="text-lg font-semibold text-white mb-2">
        No Winners Yet
      </h3>

      <p className="text-sm text-zinc-400 max-w-md mx-auto mb-6">
        {hasScripts
          ? 'Start marking your best-performing videos as winners to build your Winners Bank and unlock analytics insights.'
          : 'Generate some scripts, create videos, and mark your top performers as winners to see analytics here.'}
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        {hasScripts ? (
          <Link
            href="/admin/skit-library"
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-medium rounded-lg hover:bg-amber-400 transition-colors"
          >
            Go to Script Library
            <ArrowRight className="w-4 h-4" />
          </Link>
        ) : (
          <Link
            href="/admin/skit-generator"
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500 text-black font-medium rounded-lg hover:bg-teal-400 transition-colors"
          >
            Generate Your First Script
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}

        <Link
          href="/admin/winners-bank"
          className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white font-medium rounded-lg hover:bg-zinc-700 transition-colors"
        >
          View Winners Bank
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="mt-8 pt-6 border-t border-zinc-800">
        <p className="text-xs text-zinc-500 mb-3">What counts as a winner?</p>
        <div className="flex flex-wrap justify-center gap-2 text-xs">
          <span className="px-2 py-1 bg-zinc-800 text-zinc-300 rounded">High views</span>
          <span className="px-2 py-1 bg-zinc-800 text-zinc-300 rounded">Strong engagement</span>
          <span className="px-2 py-1 bg-zinc-800 text-zinc-300 rounded">Good retention</span>
          <span className="px-2 py-1 bg-zinc-800 text-zinc-300 rounded">Viral potential</span>
        </div>
      </div>
    </div>
  );
}

export default WinnersEmptyState;
