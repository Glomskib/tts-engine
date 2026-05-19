'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface Health {
  ok?: boolean;
  status?: string;
  version?: string;
  checks?: Array<{ name: string; status: string; responseTime?: number }>;
  env?: Record<string, boolean>;
  env_report?: {
    env_ok?: boolean;
    required_present?: number;
    required_total?: number;
    optional_present?: number;
    optional_total?: number;
  };
}

export default function LaunchStatusPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/health');
      const j = await r.json() as Health;
      setHealth(j);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Admin home
        </Link>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <h1 className="text-2xl font-bold mb-1">Launch status</h1>
      <p className="text-zinc-400 text-sm mb-6">Live health of every external dependency.</p>

      {loading && !health && <Loader2 className="w-6 h-6 animate-spin text-teal-400" />}

      {health && (
        <>
          <div className={`mb-6 p-4 rounded-xl border ${
            health.ok ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-red-500/40 bg-red-500/10'
          }`}>
            <div className="flex items-center gap-2">
              {health.ok ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
              <div className="font-bold text-lg">{health.status?.toUpperCase()}</div>
              <span className="text-xs text-zinc-400 ml-auto">SHA <span className="font-mono">{health.version}</span></span>
            </div>
          </div>

          <h2 className="text-lg font-semibold mb-2">External services</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
            {(health.checks || []).map((c) => (
              <div key={c.name} className={`p-3 rounded-lg border flex items-center gap-2 ${
                c.status === 'pass' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'
              }`}>
                {c.status === 'pass'
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  : <XCircle className="w-4 h-4 text-red-400" />}
                <span className="text-sm font-medium">{c.name}</span>
                {c.responseTime && <span className="text-xs text-zinc-500 ml-auto">{c.responseTime}ms</span>}
              </div>
            ))}
          </div>

          <h2 className="text-lg font-semibold mb-2">Env coverage</h2>
          <div className="p-4 rounded-xl border border-white/10 bg-zinc-900/40 text-sm">
            <div>Required: <span className="text-emerald-400 font-semibold">{health.env_report?.required_present}/{health.env_report?.required_total}</span></div>
            <div>Optional: <span className="text-amber-400 font-semibold">{health.env_report?.optional_present}/{health.env_report?.optional_total}</span></div>
            {(health.env_report?.optional_present ?? 0) < (health.env_report?.optional_total ?? 0) && (
              <div className="text-xs text-zinc-500 mt-2 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                Optional gaps may include HEYGEN_API_KEY, ELEVENLABS_API_KEY, TELEGRAM_BOT_TOKEN, etc. Check Vercel → Settings → Environment Variables.
              </div>
            )}
          </div>

          <h2 className="text-lg font-semibold mb-2 mt-6">Quick actions</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/launch-cleanup" className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold text-sm">
              Run launch cleanup
            </Link>
            <Link href="/admin/render-jobs" className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-sm">
              Render jobs queue
            </Link>
            <Link href="/admin/feedback" className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-sm">
              User feedback
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
