'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Film, Play, AlertTriangle, ArrowRight, RotateCw } from 'lucide-react';
import type { Mode, RunStatus } from '@/lib/video-engine/types';

interface Run {
  id: string;
  mode: Mode;
  status: RunStatus;
  target_clip_count: number;
  created_at: string;
  completed_at: string | null;
}

type Bucket = 'in_progress' | 'ready' | 'failed';

function bucketFor(status: RunStatus): Bucket {
  if (status === 'complete') return 'ready';
  if (status === 'failed') return 'failed';
  return 'in_progress';
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(1, Math.round((now - then) / 1000));
  if (diffSec < 60) return 'just now';
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function titleFor(run: Run): string {
  const d = new Date(run.created_at);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `Upload · ${date}, ${time}`;
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

  return (
    <section aria-labelledby="continue-heading" className="space-y-4">
      <header>
        <h2 id="continue-heading" className="text-sm font-semibold text-zinc-100">
          Continue your clips
        </h2>
        <p className="text-xs text-zinc-500 mt-0.5">Finish or revisit your recent uploads</p>
      </header>

      {err ? (
        <div className="text-red-300 text-sm">
          We couldn&rsquo;t load your uploads right now. Refresh to try again.
        </div>
      ) : !runs ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your uploads&hellip;
        </div>
      ) : runs.length === 0 ? (
        <EmptyState />
      ) : (
        <ContinuationGroups runs={runs} />
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 px-4 py-6 flex items-start gap-3">
      <div className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
        <Film className="w-4 h-4 text-zinc-400" />
      </div>
      <div className="text-sm leading-relaxed">
        <div className="text-zinc-200 font-medium">No clips yet</div>
        <div className="text-zinc-400">Upload a video to get started</div>
      </div>
    </div>
  );
}

function ContinuationGroups({ runs }: { runs: Run[] }) {
  const inProgress = runs.filter((r) => bucketFor(r.status) === 'in_progress');
  const ready      = runs.filter((r) => bucketFor(r.status) === 'ready');
  const failed     = runs.filter((r) => bucketFor(r.status) === 'failed');

  return (
    <div className="space-y-5">
      {inProgress.length > 0 && <Group label="In progress" tone="blue"    runs={inProgress} />}
      {ready.length > 0      && <Group label="Ready to post" tone="emerald" runs={ready} />}
      {failed.length > 0     && <Group label="Needs attention" tone="red"   runs={failed} />}
    </div>
  );
}

function Group({
  label, tone, runs,
}: {
  label: string;
  tone: 'blue' | 'emerald' | 'red';
  runs: Run[];
}) {
  const dotClass =
    tone === 'emerald' ? 'bg-emerald-500'
    : tone === 'red'   ? 'bg-red-500'
    :                    'bg-blue-500';
  const labelClass =
    tone === 'emerald' ? 'text-emerald-300'
    : tone === 'red'   ? 'text-red-300'
    :                    'text-blue-300';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${labelClass}`}>
          {label}
        </span>
        <span className="text-[11px] text-zinc-600">· {runs.length}</span>
      </div>
      <ul className="space-y-2">
        {runs.map((run) => (
          <li key={run.id}>
            <ContinuationCard run={run} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContinuationCard({ run }: { run: Run }) {
  const bucket = bucketFor(run.status);

  const icon =
    bucket === 'ready'   ? <Play className="w-4 h-4 text-emerald-300" />
    : bucket === 'failed' ? <AlertTriangle className="w-4 h-4 text-red-300" />
    :                       <Loader2 className="w-4 h-4 text-blue-300 animate-spin" />;

  const iconRing =
    bucket === 'ready'   ? 'border-emerald-800/60 bg-emerald-950/40'
    : bucket === 'failed' ? 'border-red-800/60 bg-red-950/40'
    :                       'border-blue-800/60 bg-blue-950/40';

  const statusLabel =
    bucket === 'ready'   ? 'Ready'
    : bucket === 'failed' ? 'Failed'
    :                       livingStatusLabel(run.status);

  const statusClass =
    bucket === 'ready'   ? 'text-emerald-300'
    : bucket === 'failed' ? 'text-red-300'
    :                       'text-blue-300';

  const ctaLabel =
    bucket === 'ready'   ? 'View clip'
    : bucket === 'failed' ? 'Retry'
    :                       'View progress';

  const ctaIcon =
    bucket === 'failed' ? <RotateCw className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />;

  const ctaHref = `/video-engine/${run.id}`;

  const ctaClass =
    bucket === 'ready'
      ? 'bg-zinc-100 hover:bg-white text-zinc-900'
    : bucket === 'failed'
      ? 'bg-red-500/15 hover:bg-red-500/25 text-red-200 border border-red-700/50'
      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100';

  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 sm:px-4 sm:py-3.5 hover:border-zinc-700 transition-colors">
      <Link
        href={ctaHref}
        aria-label={`${ctaLabel}: ${titleFor(run)}`}
        className="flex items-center gap-3 min-w-0 flex-1"
      >
        <div className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${iconRing}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-zinc-100 truncate">{titleFor(run)}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px]">
            <span className={`font-semibold ${statusClass}`}>{statusLabel}</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">{relativeTime(run.created_at)}</span>
          </div>
        </div>
      </Link>
      <Link
        href={ctaHref}
        className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg text-xs sm:text-sm font-semibold px-3 py-2 min-h-[40px] ${ctaClass} transition-colors`}
      >
        <span className="hidden sm:inline">{ctaLabel}</span>
        {ctaIcon}
      </Link>
    </div>
  );
}

function livingStatusLabel(status: RunStatus): string {
  switch (status) {
    case 'created':      return 'Queued';
    case 'transcribing': return 'Analyzing';
    case 'analyzing':    return 'Finding moments';
    case 'assembling':   return 'Building';
    case 'rendering':    return 'Rendering';
    default:             return 'In progress';
  }
}
