'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function LaunchCleanupPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eligibleUsers, setEligibleUsers] = useState<Array<{ id: string; email?: string; name?: string | null }>>([]);
  const [grantEmail, setGrantEmail] = useState('');
  const [granting, setGranting] = useState(false);
  const [grantResult, setGrantResult] = useState<Record<string, unknown> | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);

  // Load eligible (non-admin) users for the grant-unlimited selector
  React.useEffect(() => {
    fetch('/api/admin/grant-unlimited')
      .then(async r => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.eligible)) setEligibleUsers(j.eligible);
      })
      .catch(() => {});
  }, []);

  async function grantUnlimited() {
    if (!grantEmail.trim()) return;
    setGranting(true);
    setGrantError(null);
    setGrantResult(null);
    try {
      const r = await fetch('/api/admin/grant-unlimited', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: grantEmail.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error((j as { error?: string }).error || `HTTP ${r.status}`);
      setGrantResult((j as { summary?: Record<string, unknown> }).summary || j);
    } catch (e) {
      setGrantError(e instanceof Error ? e.message : String(e));
    } finally {
      setGranting(false);
    }
  }

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
      <div className="mt-8 p-5 rounded-2xl border border-purple-500/30 bg-purple-500/5">
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <span className="text-2xl">✨</span> Grant unlimited credits
        </h2>
        <p className="text-zinc-400 text-sm mb-4">
          Bumps a user to the Fleet tier with 999,999 credits + unlimited flag in profiles.
          Eligible (non-admin) accounts: {eligibleUsers.length}.
        </p>

        {eligibleUsers.length > 0 && (
          <div className="mb-3 text-xs text-zinc-400">
            <div className="font-semibold mb-1">Detected:</div>
            <ul className="space-y-0.5">
              {eligibleUsers.slice(0, 10).map((u) => (
                <li key={u.id} className="flex items-center gap-2">
                  <button
                    onClick={() => setGrantEmail(u.email || '')}
                    className="text-purple-300 hover:text-purple-200 underline"
                  >
                    {u.email}
                  </button>
                  {u.name && <span className="text-zinc-500">({u.name})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={grantEmail}
            onChange={(e) => setGrantEmail(e.target.value)}
            placeholder="user@example.com"
            className="flex-1 px-4 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 focus:border-purple-500 outline-none text-sm"
          />
          <button
            onClick={grantUnlimited}
            disabled={granting || !grantEmail.trim()}
            className="px-5 py-2.5 rounded-lg bg-purple-500 hover:bg-purple-400 disabled:opacity-40 text-zinc-950 font-semibold text-sm whitespace-nowrap"
          >
            {granting ? 'Granting…' : '✨ Grant unlimited'}
          </button>
        </div>

        {grantError && (
          <div className="mt-3 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm">
            {grantError}
          </div>
        )}
        {grantResult && (
          <div className="mt-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
            <div className="text-emerald-300 font-semibold text-sm mb-2">✓ Granted</div>
            <pre className="text-xs text-zinc-300 bg-zinc-950/60 p-2 rounded overflow-x-auto">{JSON.stringify(grantResult, null, 2)}</pre>
          </div>
        )}
      </div>

    </div>
  );
}
