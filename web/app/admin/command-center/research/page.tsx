'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Search, CheckCircle, XCircle,
  Activity, Clock, AlertTriangle,
} from 'lucide-react';
import CCSubnav from '../_components/CCSubnav';

// ── Types ────────────────────────────────────────────────────────────────────

interface ResearchJob {
  id: string;
  created_at: string;
  job_type: string;
  query: string;
  targets: unknown[];
  status: 'queued' | 'running' | 'ok' | 'error';
  summary: Record<string, unknown> | null;
  error: string | null;
  requested_by: string | null;
  run_id: string | null;
  finished_at: string | null;
}

interface RateLimitStatus {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
}

interface ResearchData {
  jobs: ResearchJob[];
  rate_limit: RateLimitStatus;
  status_counts: Record<string, number>;
  fetched_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATUS_CFG: Record<string, { color: string; icon: React.ElementType }> = {
  ok: { color: 'bg-emerald-500/20 text-emerald-400', icon: CheckCircle },
  error: { color: 'bg-red-500/20 text-red-400', icon: XCircle },
  running: { color: 'bg-blue-500/20 text-blue-400', icon: Activity },
  queued: { color: 'bg-amber-500/20 text-amber-400', icon: Clock },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { color: 'bg-zinc-700 text-zinc-400', icon: Clock };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
}

const STATUS_FILTERS = ['all', 'queued', 'running', 'ok', 'error'] as const;

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ResearchOpsPage() {
  const [data, setData] = useState<ResearchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/admin/command-center/research?${params}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch research data:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const rl = data?.rate_limit;
  const counts = data?.status_counts;

  return (
    <div className="space-y-6">
      <CCSubnav />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Research Ops</h2>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Rate Limit */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Rate Limit</span>
            <AlertTriangle className={`w-4 h-4 ${rl?.allowed ? 'text-emerald-400' : 'text-red-400'}`} />
          </div>
          <div className="text-2xl font-bold text-white">
            {rl ? `${rl.current}/${rl.limit}` : '--'}
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            {rl ? (rl.allowed ? `${rl.remaining} remaining this hour` : 'Cap reached') : ''}
          </div>
        </div>

        {/* Status Counts */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">OK (24h)</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">{counts?.ok ?? 0}</div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Errors (24h)</span>
            <XCircle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-bold text-white">{counts?.error ?? 0}</div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Queued/Running</span>
            <Activity className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white">
            {(counts?.queued ?? 0) + (counts?.running ?? 0)}
          </div>
        </div>
      </div>

      {/* Rate Limit Bar */}
      {rl && rl.limit > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Hourly Research Usage</span>
            <span className="text-xs text-zinc-400">{rl.current} / {rl.limit}</span>
          </div>
          <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                rl.current / rl.limit > 0.8
                  ? 'bg-red-500'
                  : rl.current / rl.limit > 0.5
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, (rl.current / rl.limit) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Status Filters */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Filter:</span>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-2 py-1 rounded text-xs ${
              statusFilter === f ? 'bg-zinc-700 text-white' : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {f}
            {f !== 'all' && counts ? ` (${counts[f] ?? 0})` : ''}
          </button>
        ))}
      </div>

      {/* Jobs Table */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
        <div className="p-3 border-b border-zinc-800 flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-zinc-500" />
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider">Research Jobs</h3>
        </div>
        <div className="divide-y divide-zinc-800">
          {(!data || data.jobs.length === 0) && (
            <div className="px-4 py-6 text-center text-zinc-500">
              {loading ? 'Loading...' : 'No research jobs found'}
            </div>
          )}
          {data?.jobs.map((job) => (
            <div key={job.id}>
              <button
                onClick={() => setExpandedId(expandedId === job.id ? null : job.id)}
                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left"
              >
                <StatusBadge status={job.status} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-zinc-200 truncate block">{job.query || '(no query)'}</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                  {job.job_type}
                </span>
                <span className="text-xs text-zinc-500 whitespace-nowrap">
                  {timeAgo(job.created_at)}
                </span>
                {job.requested_by && (
                  <span className="text-xs text-zinc-600 truncate max-w-[100px]">
                    {job.requested_by}
                  </span>
                )}
                <span className="text-zinc-600 text-xs">{expandedId === job.id ? '\u25B2' : '\u25BC'}</span>
              </button>

              {/* Expanded detail */}
              {expandedId === job.id && (
                <div className="bg-zinc-950/50 border-t border-zinc-800 px-4 py-3 space-y-2 text-xs">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <span className="text-zinc-500">ID:</span>{' '}
                      <span className="font-mono text-zinc-400">{job.id.slice(0, 8)}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Created:</span>{' '}
                      <span className="text-zinc-400">{new Date(job.created_at).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Finished:</span>{' '}
                      <span className="text-zinc-400">
                        {job.finished_at ? new Date(job.finished_at).toLocaleString() : 'running'}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Duration:</span>{' '}
                      <span className="text-zinc-400">
                        {job.finished_at
                          ? `${((new Date(job.finished_at).getTime() - new Date(job.created_at).getTime()) / 1000).toFixed(1)}s`
                          : '-'}
                      </span>
                    </div>
                  </div>
                  {job.run_id && (
                    <div>
                      <span className="text-zinc-500">Run ID:</span>{' '}
                      <span className="font-mono text-zinc-400">{job.run_id}</span>
                    </div>
                  )}
                  {job.targets && (job.targets as unknown[]).length > 0 && (
                    <div>
                      <span className="text-zinc-500">Targets:</span>{' '}
                      <span className="font-mono text-zinc-400">{JSON.stringify(job.targets)}</span>
                    </div>
                  )}
                  {job.error && (
                    <div className="bg-red-950/30 rounded px-3 py-2 text-red-400">
                      {job.error}
                    </div>
                  )}
                  {job.summary && Object.keys(job.summary).length > 0 && (
                    <div>
                      <span className="text-zinc-500">Summary:</span>
                      <pre className="mt-1 text-zinc-400 font-mono text-[11px] bg-zinc-900 rounded p-2 overflow-x-auto max-h-40">
                        {JSON.stringify(job.summary, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Auto-refresh indicator */}
      {data && (
        <div className="text-xs text-zinc-600 text-center">
          Last fetched: {new Date(data.fetched_at).toLocaleTimeString()} (auto-refreshes every 30s)
        </div>
      )}
    </div>
  );
}
