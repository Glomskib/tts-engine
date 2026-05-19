'use client';

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';

interface Status {
  active: number;
  completed: number;
  failed: number;
}

/**
 * Visible queue health banner — appears at top of /clips, /studio, /create.
 * Drives confidence: users see jobs are processing rather than wondering
 * if their tab being open even matters.
 *
 * Polls /api/worker/tick every 5s — this also IS the worker drive, so the
 * banner doubles as the queue's heartbeat.
 */
export function QueueStatusBanner() {
  const [status, setStatus] = useState<Status>({ active: 0, completed: 0, failed: 0 });
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
        const j = await r.json() as { ok?: boolean; ticked?: number; genJobsTicked?: number; rendersChecked?: number };
        if (!alive) return;
        const active = (j.ticked ?? 0) + (j.genJobsTicked ?? 0);
        const completed = j.rendersChecked ?? 0;
        setStatus((s) => ({ ...s, active, completed }));
        setLastTick(Date.now());
      } catch {
        // silent — anon/401 is expected when signed out
      }
    }
    tick();
    const id = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (status.active === 0 && lastTick === 0) return null;

  const fresh = Date.now() - lastTick < 10_000;

  return (
    <div className="mb-3 px-3 py-2 rounded-lg bg-zinc-900/60 border border-white/5 text-xs text-zinc-300 flex items-center gap-2">
      {status.active > 0 ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
          <span>
            Processing <span className="text-teal-300 font-semibold">{status.active}</span> job{status.active === 1 ? '' : 's'}…
          </span>
          <span className="text-zinc-500 text-[10px] ml-auto">Keep this tab open</span>
        </>
      ) : (
        <>
          <CheckCircle2 className={`w-3.5 h-3.5 ${fresh ? 'text-emerald-400' : 'text-zinc-600'}`} />
          <span>Queue is idle</span>
          {fresh && <span className="text-zinc-500 text-[10px] ml-auto">last checked just now</span>}
        </>
      )}
    </div>
  );
}
