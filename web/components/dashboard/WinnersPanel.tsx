'use client';

import Link from 'next/link';
import { Trophy, Eye } from 'lucide-react';

interface Winner {
  id: string;
  hook: string | null;
  view_count: number | null;
  content_format: string | null;
  product_category: string | null;
}

function formatViews(count: number | null): string {
  if (!count) return '—';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

export function WinnersPanel({ winners }: { winners: Winner[] }) {
  if (winners.length === 0) {
    return (
      <div className="bg-zinc-900/50 rounded-xl border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white mb-3">Winning Content</h2>
        <div className="text-center py-6">
          <Trophy className="w-10 h-10 text-yellow-400/50 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">No winners yet. Post content to discover what works!</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-white">Winning Content</h2>
        <Link
          href="/admin/winners-bank"
          className="text-xs text-teal-400 hover:text-teal-300 transition-colors min-h-[44px] flex items-center"
        >
          View all
        </Link>
      </div>
      <div className="space-y-2">
        {winners.map((w) => (
          <Link
            key={w.id}
            href="/admin/winners-bank"
            className="flex items-start gap-3 bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-4 hover:bg-yellow-500/10 transition-colors min-h-[64px]"
          >
            <Trophy className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white leading-snug line-clamp-2">
                {w.hook || 'Untitled winner'}
              </p>
              <div className="flex items-center gap-3 mt-1.5">
                {w.view_count != null && (
                  <span className="flex items-center gap-1 text-xs text-zinc-500">
                    <Eye className="w-3 h-3" />
                    {formatViews(w.view_count)}
                  </span>
                )}
                {w.content_format && (
                  <span className="text-xs text-zinc-600">{w.content_format}</span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
