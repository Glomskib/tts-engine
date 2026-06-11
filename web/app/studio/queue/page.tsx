'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Check, AlertTriangle, Play, ArrowLeft } from 'lucide-react';

interface Row {
  id: string;
  status: string;
  created_at: string;
  completed_at?: string | null;
  target_clip_count?: number;
  context_json?: { progress?: number; final_url?: string; thumb_url?: string; describe?: string };
  /** Rendered outputs from ve_rendered_clips — GET /api/create/jobs attaches
   *  these. output_url is where the worker actually puts the playable video
   *  (it never writes context_json.final_url). */
  clips?: { output_url: string | null; status: string }[];
  error_message?: string | null;
}

export default function StudioQueuePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [authErr, setAuthErr] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('/api/create/jobs', { cache: 'no-store' });
        if (r.status === 401) { setAuthErr(true); setLoading(false); return; }
        if (!r.ok) return;
        // GET /api/create/jobs returns { ok, jobs } — `jobs` was missing here,
        // so this page always rendered "No clips yet" even with finished runs.
        const j = await r.json() as { jobs?: Row[]; rows?: Row[]; data?: Row[] };
        if (!alive) return;
        setRows(j.jobs || j.rows || j.data || []);
      } finally {
        if (alive) setLoading(false);
      }
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}>
        <div className="flex items-center gap-3 mb-5">
          <Link href="/studio" className="p-2 rounded-full hover:bg-white/10"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="text-xl font-bold">Studio Queue</h1>
            <p className="text-xs text-zinc-400">Everything you've recorded or uploaded. Refreshes every 4s.</p>
          </div>
        </div>
        {authErr && (
          <div className="text-center py-12 space-y-3">
            <div className="text-zinc-400 text-sm">Sign in to see your queue.</div>
            <Link href="/login" className="inline-block px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-sm font-semibold">Sign in</Link>
          </div>
        )}
        {!authErr && loading && rows.length === 0 && (
          <div className="text-center py-12"><Loader2 className="w-6 h-6 mx-auto animate-spin text-teal-400" /></div>
        )}
        {!authErr && !loading && rows.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <div className="text-zinc-400 text-sm">No clips yet.</div>
            <Link href="/studio" className="inline-block px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-sm font-semibold">Open Studio</Link>
          </div>
        )}
        <div className="space-y-2">
          {rows.map(it => {
            const ctx = it.context_json || {};
            const progress = ctx.progress || 0;
            // ctx.final_url kept first for legacy rows; the render worker
            // actually stores the video on ve_rendered_clips.output_url.
            const finalUrl = ctx.final_url || it.clips?.find(c => c.output_url)?.output_url;
            const thumb = ctx.thumb_url;
            return (
              <div key={it.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900 border border-white/10">
                <div className="w-14 h-20 rounded-md bg-black overflow-hidden flex items-center justify-center flex-shrink-0">
                  {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" />
                    : isDone(it.status) ? <Check className="w-5 h-5 text-emerald-400" />
                    : isFailed(it.status) ? <AlertTriangle className="w-5 h-5 text-red-400" />
                    : <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{statusLabel(it.status, progress)}</div>
                  <div className="text-[11px] text-zinc-500">{new Date(it.created_at).toLocaleString()}</div>
                  {ctx.describe && <div className="text-[11px] text-zinc-400 truncate mt-0.5">{ctx.describe}</div>}
                  {!isDone(it.status) && !isFailed(it.status) && (
                    <div className="mt-1 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-400" style={{ width: `${progress}%` }} />
                    </div>
                  )}
                  {it.error_message && <div className="text-[11px] text-red-400 truncate">{it.error_message}</div>}
                </div>
                {isDone(it.status) && finalUrl && (
                  <a href={finalUrl} target="_blank" rel="noreferrer" className="p-2.5 rounded-lg bg-teal-500/20 text-teal-300 hover:bg-teal-500/30">
                    <Play className="w-4 h-4" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// 'complete' is the status web/scripts/render-worker.ts writes on success —
// it was missing here, so finished runs spun at "Processing" forever.
function isDone(s: string) { return ['complete', 'ready', 'done', 'completed'].includes(s); }
function isFailed(s: string) { return ['failed', 'error'].includes(s); }
function statusLabel(s: string, p: number) {
  if (isDone(s)) return 'Ready';
  if (isFailed(s)) return 'Failed';
  if (s === 'transcribing') return 'Transcribing…';
  if (s === 'analyzing') return 'Analyzing…';
  if (s === 'assembling') return 'Assembling…';
  if (s === 'rendering') return p > 0 ? `Rendering ${p}%` : 'Rendering…';
  if (s === 'created' || s === 'queued') return 'Queued';
  return p > 0 ? `Processing ${p}%` : 'Processing…';
}
