'use client';

import { Loader2, RefreshCw } from 'lucide-react';

interface Props {
  capturedAt?: string | null; // ISO timestamp of last successful capture
  staleAfterDays?: number;
  children: React.ReactNode;
}

/**
 * Wrap /trend-radar content with this. When the last capture is older than
 * `staleAfterDays`, we hide the (likely stale / mock-shaped) rows and show a
 * clean "refreshing" empty state instead. Prevents shipping garbage to the
 * public surface while the refresh cron is fixed.
 */
export function TrendStaleGuard({ capturedAt, staleAfterDays = 14, children }: Props) {
  const stale = (() => {
    if (!capturedAt) return true;
    const ms = Date.now() - new Date(capturedAt).getTime();
    return ms > staleAfterDays * 24 * 60 * 60 * 1000;
  })();

  if (!stale) return <>{children}</>;

  return (
    <div className="max-w-2xl mx-auto py-16 px-5 text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs mb-4">
        <RefreshCw className="w-3 h-3" /> Refreshing
      </div>
      <h1 className="text-3xl font-bold mb-2">Trend Radar is updating.</h1>
      <p className="text-zinc-400 mb-6">
        Our overnight crawl is regenerating the daily snapshot. Check back shortly — we&apos;d rather show you a clean blank than a stale list.
      </p>
      <div className="inline-flex items-center gap-2 text-xs text-zinc-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Refresh in progress
      </div>
    </div>
  );
}