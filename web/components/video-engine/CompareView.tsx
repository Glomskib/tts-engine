'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import StatusPill from './StatusPill';
import { modeToWorkspaceLabel } from './WorkspaceSelector';
import type { Mode, RunStatus } from '@/lib/video-engine/types';

interface RenderedClip {
  id: string;
  template_key: string;
  cta_key: string | null;
  mode: Mode;
  status: 'queued' | 'rendering' | 'complete' | 'failed';
  output_url: string | null;
  duration_sec: number | null;
}

interface RunSummary {
  id: string;
  mode: Mode;
  status: RunStatus;
  preset_keys: string[];
  target_clip_count: number;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  rendered: RenderedClip[];
}

interface CompareData {
  source_path: string | null;
  runs: RunSummary[];
}

export default function CompareView({ runId }: { runId: string }) {
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/video-engine/runs/${runId}/compare`);
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load');
        if (!cancelled) { setData(json.data); setLoading(false); setErr(null); }
      } catch (e) {
        if (!cancelled) { setErr(e instanceof Error ? e.message : String(e)); setLoading(false); }
      }
    }
    void poll();
    const interval = setInterval(() => { void poll(); }, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [runId]);

  if (loading) return <div className="text-zinc-400 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  if (err || !data) return <div className="text-red-400 text-sm">{err ?? 'No data'}</div>;

  if (data.runs.length === 0) {
    return <div className="text-zinc-400 text-sm">No runs found for this asset.</div>;
  }

  // Show one column per unique mode (latest run per mode wins).
  const byMode = new Map<Mode, RunSummary>();
  for (const r of data.runs) {
    const existing = byMode.get(r.mode);
    if (!existing || new Date(r.created_at) > new Date(existing.created_at)) byMode.set(r.mode, r);
  }
  const columns = Array.from(byMode.values());

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">Side-by-side</h1>
        <Link href={`/video-engine/${runId}`} className="text-xs text-zinc-400 hover:text-zinc-200">← Back to run</Link>
      </div>
      <p className="text-sm text-zinc-500">
        Same source video, packaged for two different audiences.
      </p>

      <div className={`grid gap-4 grid-cols-1 ${columns.length >= 2 ? 'lg:grid-cols-2' : ''}`}>
        {columns.map((r) => (
          <div key={r.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wide">{modeToWorkspaceLabel(r.mode)}</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <StatusPill status={r.status} />
                  <Link href={`/video-engine/${r.id}`} className="text-xs text-zinc-400 hover:text-zinc-200">view full →</Link>
                </div>
              </div>
              <div className="text-xs text-zinc-500 text-right">
                {r.preset_keys.slice(0, 3).join(' · ')}
              </div>
            </div>

            {r.error_message && <div className="mb-2 text-red-400 text-xs">{r.error_message}</div>}

            {r.rendered.length === 0 ? (
              <div className="text-xs text-zinc-500 italic">No clips yet</div>
            ) : (
              <div className="grid gap-3 grid-cols-2">
                {r.rendered.map((clip) => (
                  <div key={clip.id} className="rounded-lg border border-zinc-800 overflow-hidden bg-black">
                    <div className="aspect-[9/16] flex items-center justify-center">
                      {clip.status === 'complete' && clip.output_url ? (
                        <video src={clip.output_url} controls preload="metadata" className="w-full h-full" />
                      ) : (
                        <div className="text-zinc-500 text-[10px]">{clip.status}…</div>
                      )}
                    </div>
                    <div className="p-2 text-[11px] text-zinc-400">
                      <div className="font-medium text-zinc-200 truncate">{clip.template_key}</div>
                      <div className="text-zinc-500">{clip.cta_key ?? ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
