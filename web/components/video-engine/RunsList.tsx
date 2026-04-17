'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Film } from 'lucide-react';
import StatusPill from './StatusPill';
import { modeToWorkspaceLabel } from './WorkspaceSelector';
import type { Mode, RunStatus } from '@/lib/video-engine/types';

interface Run {
  id: string;
  mode: Mode;
  status: RunStatus;
  target_clip_count: number;
  created_at: string;
  completed_at: string | null;
}

export default function RunsList() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/video-engine/runs?limit=10');
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'load failed');
        if (!cancelled) setRuns(json.data.runs);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (err) return <div className="text-red-300 text-sm">We couldn&rsquo;t load your videos right now. Refresh to try again.</div>;
  if (!runs) return <div className="flex items-center gap-2 text-zinc-500 text-sm"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your videos&hellip;</div>;
  if (runs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 px-4 py-6 flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
          <Film className="w-4 h-4 text-zinc-400" />
        </div>
        <div className="text-sm text-zinc-400 leading-relaxed">
          <div className="text-zinc-200 font-medium">No videos yet</div>
          Upload one above to get your first set of clips.
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {runs.map((r) => (
        <li key={r.id}>
          <Link
            href={`/video-engine/${r.id}`}
            className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 hover:border-zinc-600 hover:bg-zinc-900/60 px-4 py-3 min-h-[56px] transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <StatusPill status={r.status} />
              <span className="text-sm font-medium text-zinc-200">{modeToWorkspaceLabel(r.mode)}</span>
            </div>
            <span className="text-xs text-zinc-500 shrink-0">{new Date(r.created_at).toLocaleDateString()}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
