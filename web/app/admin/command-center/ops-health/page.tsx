'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Shield, CheckCircle, XCircle,
  Activity, Clock, Zap, Send,
} from 'lucide-react';
import CCSubnav from '../_components/CCSubnav';

// ── Types ────────────────────────────────────────────────────────────────────

interface RunRow {
  id: string;
  job: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'ok' | 'error';
  error: string | null;
  meta: Record<string, unknown>;
  run_source: string | null;
  requested_by: string | null;
}

interface JobHealth {
  job: string;
  last_run: RunRow | null;
  recent_runs: RunRow[];
  success_rate: number;
  healthy: boolean;
  source_breakdown: Record<string, number>;
}

interface CapStatus {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
}

interface HealthData {
  overall_healthy: boolean;
  jobs: JobHealth[];
  failure_alerts: RunRow[];
  dispatches: RunRow[];
  cap: CapStatus;
  env_modes: {
    ri_auto_draft: boolean;
    reminders_enabled: boolean;
    ri_max_ai_drafts_per_hour: number;
    node_id: string | null;
  };
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

const SOURCE_COLORS: Record<string, string> = {
  vercel_cron: 'bg-blue-500/20 text-blue-400',
  launchd: 'bg-purple-500/20 text-purple-400',
  openclaw: 'bg-amber-500/20 text-amber-400',
  dispatch: 'bg-teal-500/20 text-teal-400',
  manual: 'bg-zinc-700 text-zinc-400',
};

function SourceBadge({ source }: { source: string | null }) {
  const src = source ?? 'unknown';
  const color = SOURCE_COLORS[src] ?? 'bg-zinc-700 text-zinc-400';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {src}
    </span>
  );
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function OpsHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/command-center/ops-health');
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch ops health:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const riJob = data?.jobs.find((j) => j.job === 'ri_ingestion');
  const nightlyJob = data?.jobs.find((j) => j.job === 'nightly_draft');

  // Collect all unique sources across all runs
  const allSources = data
    ? [...new Set(data.jobs.flatMap((j) => j.recent_runs.map((r) => r.run_source ?? 'unknown')))]
    : [];

  return (
    <div className="space-y-6">
      <CCSubnav />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Ops Health</h2>
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
        <StatCard
          label="Overall Health"
          value={data ? (data.overall_healthy ? 'Healthy' : 'Degraded') : '--'}
          icon={Shield}
          color={data?.overall_healthy ? 'text-emerald-400' : 'text-red-400'}
        />
        <StatCard
          label="Last RI Run"
          value={riJob?.last_run ? timeAgo(riJob.last_run.started_at) : 'Never'}
          sub={riJob?.last_run ? `${riJob.last_run.status} via ${riJob.last_run.run_source ?? 'unknown'}` : undefined}
          icon={Activity}
          color="text-blue-400"
        />
        <StatCard
          label="Last Nightly"
          value={nightlyJob?.last_run ? timeAgo(nightlyJob.last_run.started_at) : 'Never'}
          sub={nightlyJob?.last_run ? `${nightlyJob.last_run.status} via ${nightlyJob.last_run.run_source ?? 'unknown'}` : undefined}
          icon={Clock}
          color="text-amber-400"
        />
        <StatCard
          label="Drafts/Hour Cap"
          value={data ? `${data.cap.current}/${data.cap.limit}` : '--'}
          sub={data ? (data.cap.allowed ? `${data.cap.remaining} remaining` : 'Cap reached') : undefined}
          icon={Zap}
          color={data?.cap.allowed ? 'text-emerald-400' : 'text-red-400'}
        />
      </div>

      {/* Cap usage bar */}
      {data && data.cap.limit > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Hourly Auto-Draft Usage</span>
            <span className="text-xs text-zinc-400">{data.cap.current} / {data.cap.limit}</span>
          </div>
          <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                data.cap.current / data.cap.limit > 0.8
                  ? 'bg-red-500'
                  : data.cap.current / data.cap.limit > 0.5
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, (data.cap.current / data.cap.limit) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Source Filter */}
      {allSources.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Filter by source:</span>
          <button
            onClick={() => setSourceFilter(null)}
            className={`px-2 py-1 rounded text-xs ${
              sourceFilter === null ? 'bg-zinc-700 text-white' : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            All
          </button>
          {allSources.map((src) => (
            <button
              key={src}
              onClick={() => setSourceFilter(sourceFilter === src ? null : src)}
              className={`px-2 py-1 rounded text-xs ${
                sourceFilter === src ? 'bg-zinc-700 text-white' : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {src}
            </button>
          ))}
        </div>
      )}

      {/* Job Health Table */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
        <div className="p-3 border-b border-zinc-800">
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider">Job Health</h3>
        </div>
        <div className="divide-y divide-zinc-800">
          {(!data || data.jobs.length === 0) && (
            <div className="px-4 py-6 text-center text-zinc-500">
              {loading ? 'Loading...' : 'No job data'}
            </div>
          )}
          {data?.jobs.map((job) => {
            const filteredRuns = sourceFilter
              ? job.recent_runs.filter((r) => (r.run_source ?? 'unknown') === sourceFilter)
              : job.recent_runs;

            return (
              <div key={job.job}>
                <button
                  onClick={() => setExpandedJob(expandedJob === job.job ? null : job.job)}
                  className="w-full flex items-center gap-4 px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left"
                >
                  <div className={`w-2 h-2 rounded-full ${job.healthy ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-zinc-200">{job.job}</span>
                  </div>
                  {/* Source breakdown chips */}
                  <div className="hidden md:flex items-center gap-1">
                    {Object.entries(job.source_breakdown).map(([src, count]) => (
                      <span key={src} className={`text-[10px] px-1.5 py-0.5 rounded ${SOURCE_COLORS[src] ?? 'bg-zinc-700 text-zinc-400'}`}>
                        {src}:{count}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {job.last_run ? timeAgo(job.last_run.started_at) : 'Never'}
                  </div>
                  <StatusBadge status={job.last_run?.status ?? 'unknown'} />
                  <div className="text-xs text-zinc-500 w-12 text-right">
                    {job.success_rate}%
                  </div>
                  <span className="text-zinc-600 text-xs">{expandedJob === job.job ? '\u25B2' : '\u25BC'}</span>
                </button>

                {/* Expanded: recent runs with source column */}
                {expandedJob === job.job && (
                  <div className="bg-zinc-950/50 border-t border-zinc-800">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-zinc-600 border-b border-zinc-800">
                          <th className="px-4 py-2 text-left font-medium">Started</th>
                          <th className="px-2 py-2 text-left font-medium">Duration</th>
                          <th className="px-2 py-2 text-left font-medium">Status</th>
                          <th className="px-2 py-2 text-left font-medium">Source</th>
                          <th className="px-2 py-2 text-left font-medium">Requested By</th>
                          <th className="px-2 py-2 text-left font-medium">Error</th>
                          <th className="px-4 py-2 text-left font-medium">Meta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {filteredRuns.map((run) => {
                          const dur = run.finished_at
                            ? `${((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000).toFixed(0)}s`
                            : 'running';
                          return (
                            <tr key={run.id} className="hover:bg-zinc-800/30">
                              <td className="px-4 py-1.5 text-zinc-400">{timeAgo(run.started_at)}</td>
                              <td className="px-2 py-1.5 text-zinc-400">{dur}</td>
                              <td className="px-2 py-1.5"><StatusBadge status={run.status} /></td>
                              <td className="px-2 py-1.5"><SourceBadge source={run.run_source} /></td>
                              <td className="px-2 py-1.5 text-zinc-500 truncate max-w-[120px]" title={run.requested_by ?? ''}>
                                {run.requested_by ?? '-'}
                              </td>
                              <td className="px-2 py-1.5 text-red-400 truncate max-w-[150px]" title={run.error ?? ''}>
                                {run.error ?? '-'}
                              </td>
                              <td className="px-4 py-1.5 text-zinc-500 font-mono truncate max-w-[200px]" title={JSON.stringify(run.meta)}>
                                {Object.keys(run.meta).length > 0 ? JSON.stringify(run.meta) : '-'}
                              </td>
                            </tr>
                          );
                        })}
                        {filteredRuns.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-4 py-3 text-center text-zinc-600">
                              {sourceFilter ? `No runs from ${sourceFilter}` : 'No runs recorded'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Dispatches */}
      {data && data.dispatches.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div className="p-3 border-b border-zinc-800 flex items-center gap-2">
            <Send className="w-3.5 h-3.5 text-zinc-500" />
            <h3 className="text-xs text-zinc-500 uppercase tracking-wider">Recent Dispatches</h3>
          </div>
          <div className="max-h-60 overflow-y-auto">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-zinc-800">
                {data.dispatches.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2 text-zinc-400 whitespace-nowrap">{timeAgo(d.started_at)}</td>
                    <td className="px-2 py-2 text-zinc-300">{d.job.replace('dispatch:', '')}</td>
                    <td className="px-2 py-2"><SourceBadge source={d.run_source} /></td>
                    <td className="px-2 py-2 text-zinc-500">{d.requested_by ?? '-'}</td>
                    <td className="px-2 py-2 text-zinc-500 font-mono truncate max-w-[200px]">
                      {(d.meta as Record<string, unknown>)?.target_job as string ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Failure Alerts */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
        <div className="p-3 border-b border-zinc-800">
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider">Recent Failure Alerts</h3>
        </div>
        <div className="max-h-60 overflow-y-auto">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-zinc-800">
              {(!data || data.failure_alerts.length === 0) && (
                <tr>
                  <td className="px-4 py-3 text-center text-zinc-500">
                    {loading ? 'Loading...' : 'No recent alerts'}
                  </td>
                </tr>
              )}
              {data?.failure_alerts.map((alert) => (
                <tr key={alert.id}>
                  <td className="px-4 py-2 text-zinc-400 whitespace-nowrap">{timeAgo(alert.started_at)}</td>
                  <td className="px-2 py-2 text-zinc-300">{alert.job.replace('failure_alert:', '')}</td>
                  <td className="px-2 py-2 text-red-400 truncate max-w-[300px]" title={(alert.meta as Record<string, unknown>)?.error as string ?? ''}>
                    {(alert.meta as Record<string, unknown>)?.error as string ?? '-'}
                  </td>
                  <td className="px-2 py-2 text-zinc-500">{(alert.meta as Record<string, unknown>)?.node_id as string ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Env Modes */}
      {data && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Environment</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-zinc-500">Auto-Draft:</span>{' '}
              <span className={data.env_modes.ri_auto_draft ? 'text-emerald-400' : 'text-zinc-400'}>
                {data.env_modes.ri_auto_draft ? 'ON' : 'OFF'}
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Reminders:</span>{' '}
              <span className={data.env_modes.reminders_enabled ? 'text-emerald-400' : 'text-zinc-400'}>
                {data.env_modes.reminders_enabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Draft Cap/hr:</span>{' '}
              <span className="text-zinc-300">{data.env_modes.ri_max_ai_drafts_per_hour}</span>
            </div>
            <div>
              <span className="text-zinc-500">Node ID:</span>{' '}
              <span className="text-zinc-300 font-mono">{data.env_modes.node_id ?? 'default'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Auto-refresh indicator */}
      {data && (
        <div className="text-xs text-zinc-600 text-center">
          Last fetched: {new Date(data.fetched_at).toLocaleTimeString()} (auto-refreshes every 30s)
        </div>
      )}
    </div>
  );
}
