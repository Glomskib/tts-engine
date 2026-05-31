'use client';

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

interface Status {
  active: number;
  completed: number;
  failed: number;
  pending: number;
  oldestPendingAgeSec: number | null;
}

/**
 * Visible queue health banner — appears at top of /clips, /studio, /create.
 * Drives confidence: users see jobs are processing rather than wondering
 * if their tab being open even matters.
 *
 * Polls /api/worker/tick every 5s — this also IS the worker drive, so the
 * banner doubles as the queue's heartbeat.
 *
 * Three states (incident 2026-05-27 — previously this only had two and lied
 * about a stuck queue by showing "Queue is idle"):
 *   • active>0           — "Processing N jobs" (spinner)
 *   • pending>0, active=0 — "N queued · oldest Xm ago" (warning, not green)
 *   • pending=0           — "Queue is idle" (true idle, green)
 */
function formatAge(sec: number | null): string {
  if (sec == null) return '';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

export function QueueStatusBanner() {
  const [status, setStatus] = useState<Status>({
    active: 0, completed: 0, failed: 0, pending: 0, oldestPendingAgeSec: null,
  });
  const [lastTick, setLastTick] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const r = await fetch('/api/worker/tick', {
          method: 'POST',
          credentials: 'include',
        });
        if (!r.ok) return;
        const j = await r.json() as {
          ok?: boolean;
          ticked?: number;
          genJobsTicked?: number;
          rendersChecked?: number;
          pending?: number;
          oldestPendingAgeSec?: number | null;
        };
        if (!alive) return;
        const active = (j.ticked ?? 0) + (j.genJobsTicked ?? 0);
        const completed = j.rendersChecked ?? 0;
        setStatus((s) => ({
          ...s,
          active,
          completed,
          pending: j.pending ?? 0,
          oldestPendingAgeSec: j.oldestPendingAgeSec ?? null,
        }));
        setLastTick(Date.now());
      } catch {
        // silent — anon/401 is expected when signed out
      }
    }
    tick();
    const id = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (status.active === 0 && status.pending === 0 && lastTick === 0) return null;

  const fresh = Date.now() - lastTick < 10_000;
  // Consider the queue "stuck" if there are pending runs older than 60s
  // and nothing is currently advancing.
  const isStuck = status.active === 0 && status.pending > 0 && (status.oldestPendingAgeSec ?? 0) > 60;

  if (status.active > 0) {
    return (
      <div className="mb-3 px-3 py-2 rounded-lg bg-zinc-900/60 border border-white/5 text-xs text-zinc-300 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
        <span>
          Processing <span className="text-teal-300 font-semibold">{status.active}</span> job{status.active === 1 ? '' : 's'}…
        </span>
        {status.pending > status.active && (
          <span className="text-zinc-500">· {status.pending - status.active} waiting</span>
        )}
        <span className="text-zinc-500 text-[10px] ml-auto">Keep this tab open</span>
      </div>
    );
  }

  if (isStuck) {
    return (
      <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
        <span>
          <span className="font-semibold text-amber-100">{status.pending}</span>{' '}
          job{status.pending === 1 ? '' : 's'} queued — not advancing
          {status.oldestPendingAgeSec != null && (
            <> · oldest <span className="font-mono">{formatAge(status.oldestPendingAgeSec)}</span> ago</>
          )}
        </span>
        <span className="text-amber-300/70 text-[10px] ml-auto">
          Worker may be offline
        </span>
      </div>
    );
  }

  // True idle — no pending, no active.
  return (
    <div className="mb-3 px-3 py-2 rounded-lg bg-zinc-900/60 border border-white/5 text-xs text-zinc-300 flex items-center gap-2">
      <CheckCircle2 className={`w-3.5 h-3.5 ${fresh ? 'text-emerald-400' : 'text-zinc-600'}`} />
      <span>Queue is idle</span>
      {fresh && <span className="text-zinc-500 text-[10px] ml-auto">last checked just now</span>}
    </div>
  );
}
