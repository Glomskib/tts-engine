'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function LaunchCleanupPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runCleanup() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch('/api/admin/launch-cleanup', { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error((j as { error?: string }).error || `HTTP ${r.status}`);
      setResult((j as { summary?: Record<string, unknown> }).summary || j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" /> Admin home
      </Link>

      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Sparkles className="w-6 h-6 text-teal-400" />
        Pre-launch cleanup
      </h1>
      <p className="text-zinc-400 text-sm mt-1">
        One-shot sweep that prepares the DB for launch. Idempotent — safe to run multiple times.
      </p>

      <div className="mt-6 p-5 rounded-2xl border border-white/10 bg-zinc-900/40">
        <div className="text-sm text-zinc-300 mb-3">This will:</div>
        <ul className="space-y-1.5 text-sm text-zinc-400 mb-5 list-disc list-inside">
          <li>Delete your broken Jake avatars (null or SVG visual URLs)</li>
          <li>Mark generation_jobs stuck &gt;30min as failed</li>
          <li>Tick the worker once to drain fresh stuck jobs</li>
        </ul>

        <button
          onClick={runCleanup}
          disabled={running}
          className="px-5 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-zinc-950 font-semibold flex items-center gap-2"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {running ? 'Running…' : 'Run cleanup'}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm flex items-start gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {result && (
        <div className="mt-4 p-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10">
          <div className="flex items-center gap-2 text-emerald-300 font-semibold mb-3">
            <CheckCircle2 className="w-5 h-5" /> Cleanup complete
          </div>
          <pre className="text-xs text-zinc-300 bg-zinc-950/60 p-3 rounded-lg overflow-x-auto">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
