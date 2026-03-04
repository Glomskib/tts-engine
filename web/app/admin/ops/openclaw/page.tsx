'use client';

import { useState, useEffect } from 'react';

interface FeatureGate {
  key: string;
  description: string;
  route: string;
  required: boolean;
  would_block: boolean;
}

interface OpenClawStatus {
  openclaw_enabled: boolean;
  env_var: string;
  required_features_env: string;
  features: FeatureGate[];
  last_heartbeat: string | null;
  last_agent_run: {
    agent_id: string;
    status: string;
    ended_at: string;
  } | null;
  mission_control: {
    base_url: string;
    token_source: string;
    tokens_present: Record<string, boolean>;
    last_auth_check: {
      status: number;
      ts: string;
      ok: boolean;
    } | null;
  };
  last_error: string | null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function OpenClawStatusPage() {
  const [status, setStatus] = useState<OpenClawStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/openclaw-status')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setStatus(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold mb-4">OpenClaw Status</h1>
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold mb-4">OpenClaw Status</h1>
        <p className="text-red-400">Failed to load: {error}</p>
      </div>
    );
  }

  const mc = status.mission_control;

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold mb-6">OpenClaw Status</h1>

      <div className="space-y-4">
        {/* Feature Gate */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Feature Gate</h2>
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${status.openclaw_enabled ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="font-medium">
              {status.openclaw_enabled ? 'Enabled' : 'Disabled'}
            </span>
            <span className="text-zinc-500 text-sm">
              OPENCLAW_ENABLED={status.env_var}
            </span>
          </div>
        </div>

        {/* Scoped Feature Gates */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Feature Gates</h2>
          <div className="text-xs text-zinc-500 mb-3">
            OPENCLAW_REQUIRED_FEATURES={status.required_features_env}
          </div>
          <div className="space-y-2">
            {status.features.map((f) => (
              <div key={f.key} className="flex items-center gap-3 text-sm">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  f.would_block ? 'bg-red-400' : f.required ? 'bg-amber-400' : 'bg-zinc-600'
                }`} />
                <span className="font-mono text-xs min-w-[10rem]">{f.key}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  f.required
                    ? 'bg-amber-900/40 text-amber-300'
                    : 'bg-zinc-800 text-zinc-500'
                }`}>
                  {f.required ? 'required' : 'optional'}
                </span>
                {f.would_block && (
                  <span className="text-xs text-red-400">503 if disabled</span>
                )}
                <span className="text-zinc-500 text-xs ml-auto">{f.route}</span>
              </div>
            ))}
          </div>
          {!status.openclaw_enabled && status.features.some((f) => f.would_block) && (
            <div className="mt-3 text-xs text-red-400 bg-red-950/30 rounded px-3 py-2">
              {status.features.filter((f) => f.would_block).length} feature(s) will return 503 while OpenClaw is disabled
            </div>
          )}
        </div>

        {/* Last Heartbeat */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Last Heartbeat</h2>
          {status.last_heartbeat ? (
            <div>
              <span className="font-mono text-sm">{timeAgo(status.last_heartbeat)}</span>
              <span className="text-zinc-500 text-sm ml-2">
                ({new Date(status.last_heartbeat).toLocaleString()})
              </span>
            </div>
          ) : (
            <span className="text-zinc-500">No usage events from OpenClaw</span>
          )}
        </div>

        {/* Last Agent Run */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Last Agent Run</h2>
          {status.last_agent_run ? (
            <div className="space-y-1 text-sm">
              <div>Agent: <span className="font-mono">{status.last_agent_run.agent_id}</span></div>
              <div>Status: <span className="font-mono">{status.last_agent_run.status}</span></div>
              {status.last_agent_run.ended_at && (
                <div>Ended: {timeAgo(status.last_agent_run.ended_at)}</div>
              )}
            </div>
          ) : (
            <span className="text-zinc-500">No agent runs recorded</span>
          )}
        </div>

        {/* Mission Control */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Mission Control</h2>
          <div className="space-y-2 text-sm">
            <div>URL: <span className="font-mono text-zinc-300">{mc.base_url}</span></div>
            <div>Token source: <span className="font-mono">{mc.token_source}</span></div>
            <div className="flex gap-3">
              {Object.entries(mc.tokens_present).map(([key, present]) => (
                <span key={key} className={`text-xs px-2 py-0.5 rounded ${present ? 'bg-green-900/40 text-green-300' : 'bg-zinc-800 text-zinc-500'}`}>
                  {key.replace('MISSION_CONTROL_', 'MC_')}: {present ? 'set' : 'unset'}
                </span>
              ))}
            </div>
            {mc.last_auth_check ? (
              <div>
                Auth check: HTTP {mc.last_auth_check.status}
                {mc.last_auth_check.ok ? ' (ok)' : ' (failed)'}
                {' '}{timeAgo(mc.last_auth_check.ts)}
              </div>
            ) : (
              <div className="text-zinc-500">No auth check performed yet</div>
            )}
          </div>
        </div>

        {/* Last Error */}
        {status.last_error && (
          <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wide mb-2">Last Error</h2>
            <p className="text-red-300 text-sm font-mono">{status.last_error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
