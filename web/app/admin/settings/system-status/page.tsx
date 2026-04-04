'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity, RefreshCw, CheckCircle, AlertTriangle, XCircle,
  Clock, Database, Wifi, Video, Send, Film, Music, Scissors,
  Users, CreditCard, Timer, AlertCircle, Zap, HardDrive,
} from 'lucide-react';
import { SkeletonStats, SkeletonCard } from '@/components/ui/Skeleton';
import { StatChip } from '@/components/ui/StatChip';

type ServiceStatus = 'healthy' | 'degraded' | 'unhealthy' | 'not_configured';

interface ServiceCheck {
  name: string;
  status: ServiceStatus;
  latency?: number;
  message?: string;
  details?: string;
}

interface PipelineHealth {
  stuckRendering: number;
  stuckReview: number;
  failedLast24h: number;
}

interface UsageStats {
  totalUsers: number;
  activeThisWeek: number;
  creditsConsumedToday: number;
}

interface CronJob {
  path: string;
  schedule: string;
  description: string;
}

type Severity = 'healthy' | 'degraded' | 'critical' | 'unknown';

interface WorkflowCheck {
  name: string;
  severity: Severity;
  message: string;
  details?: Record<string, unknown>;
}

interface CronFreshness {
  job: string;
  label: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  recentFailures: number;
  severity: Severity;
  message: string;
}

interface JobQueueHealth {
  pending: number;
  running: number;
  failed24h: number;
  oldestPendingAge: string | null;
  severity: Severity;
  message: string;
}

interface WorkflowHealthReport {
  overallSeverity: Severity;
  workflows: WorkflowCheck[];
  cronFreshness: CronFreshness[];
  jobQueue: JobQueueHealth;
  warnings: string[];
}

interface MetricsSystemHealth {
  providers: Record<string, { enabled: boolean; platform?: string; description?: string; reason?: string }>;
  lastSnapshot: string | null;
  totalSnapshots: number;
  postsWithMetrics: number;
  postsWithoutMetrics: number;
}

interface EnvBootStatus {
  env_ok: boolean;
  required_present: number;
  required_total: number;
  optional_present: number;
  optional_total: number;
  integrations: { system: string; configured: boolean; missing: string[] }[];
}

interface SystemStatusData {
  ok: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy';
  envBoot?: EnvBootStatus;
  services: ServiceCheck[];
  pipeline: PipelineHealth;
  usage: UsageStats;
  cronJobs: CronJob[];
  metricsSystem?: MetricsSystemHealth;
  workflowHealth?: WorkflowHealthReport;
  totalLatency: number;
  timestamp: string;
}

export default function SystemStatusPage() {
  const [data, setData] = useState<SystemStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [telegramSent, setTelegramSent] = useState(false);

  const fetchStatus = useCallback(async (showRefreshing = true) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const res = await fetch('/api/admin/system-status');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch system status:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus(false);
  }, [fetchStatus]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => fetchStatus(false), 60000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchStatus]);

  const handleSendTelegram = async () => {
    setSendingTelegram(true);
    setTelegramSent(false);
    try {
      const res = await fetch('/api/admin/system-status/telegram', { method: 'POST' });
      if (res.ok) {
        setTelegramSent(true);
        setTimeout(() => setTelegramSent(false), 3000);
      }
    } catch (err) {
      console.error('Failed to send Telegram report:', err);
    } finally {
      setSendingTelegram(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case 'unhealthy':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'not_configured':
        return <AlertCircle className="w-5 h-5 text-zinc-500" />;
      default:
        return <Activity className="w-5 h-5 text-zinc-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500/20 border-green-500/30 text-green-400';
      case 'degraded':
        return 'bg-amber-500/20 border-amber-500/30 text-amber-400';
      case 'unhealthy':
        return 'bg-red-500/20 border-red-500/30 text-red-400';
      case 'not_configured':
        return 'bg-zinc-500/10 border-zinc-500/20 text-zinc-500';
      default:
        return 'bg-zinc-500/20 border-zinc-500/30 text-zinc-400';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'healthy': return 'Healthy';
      case 'degraded': return 'Degraded';
      case 'unhealthy': return 'Unhealthy';
      case 'not_configured': return 'Not Configured';
      default: return status;
    }
  };

  const getServiceIcon = (name: string) => {
    switch (name.toLowerCase()) {
      case 'supabase db': return <Database className="w-5 h-5" />;
      case 'heygen': return <Film className="w-5 h-5" />;
      case 'elevenlabs': return <Music className="w-5 h-5" />;
      case 'runway': return <Video className="w-5 h-5" />;
      case 'shotstack': return <Scissors className="w-5 h-5" />;
      case 'tiktok content': return <Wifi className="w-5 h-5" />;
      case 'tikwm': return <Activity className="w-5 h-5" />;
      default: return <Activity className="w-5 h-5" />;
    }
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <SkeletonStats count={4} />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto pb-24 lg:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">System Status</h1>
          <p className="text-zinc-400">Comprehensive health monitoring and diagnostics</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 rounded bg-zinc-800 border-zinc-600 text-violet-500 focus:ring-violet-500"
            />
            Auto-refresh
          </label>
          <button
            type="button"
            onClick={() => fetchStatus()}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleSendTelegram}
            disabled={sendingTelegram}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 disabled:opacity-50 transition-colors"
          >
            <Send className={`w-4 h-4 ${sendingTelegram ? 'animate-pulse' : ''}`} />
            {telegramSent ? 'Sent!' : 'Send to Telegram'}
          </button>
        </div>
      </div>

      {data && (
        <>
          {/* Overall Status Banner */}
          <div className={`mb-6 p-6 rounded-xl border ${getStatusColor(data.status)}`}>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                {getStatusIcon(data.status)}
                <div>
                  <h2 className="text-lg font-semibold capitalize">{data.status}</h2>
                  <p className="text-sm opacity-75">
                    {data.status === 'healthy'
                      ? 'All systems operational'
                      : data.status === 'degraded'
                        ? 'Some services experiencing issues'
                        : 'Critical issues detected'}
                  </p>
                </div>
              </div>
              <div className="text-right text-sm opacity-75">
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {data.totalLatency}ms total
                </div>
                <div>Last checked: {new Date(data.timestamp).toLocaleTimeString()}</div>
              </div>
            </div>
          </div>

          {/* Env Boot Status */}
          {data.envBoot && (
            <>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                Environment Config
                <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wider ${
                  data.envBoot.env_ok ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                }`}>
                  {data.envBoot.env_ok ? 'OK' : 'MISSING'}
                </span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="p-3 rounded-xl border border-white/10 bg-zinc-900/50">
                  <p className="text-xs text-zinc-500 mb-1">Required Env</p>
                  <p className={`text-lg font-bold ${data.envBoot.required_present === data.envBoot.required_total ? 'text-green-400' : 'text-red-400'}`}>
                    {data.envBoot.required_present}/{data.envBoot.required_total}
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-white/10 bg-zinc-900/50">
                  <p className="text-xs text-zinc-500 mb-1">Optional Env</p>
                  <p className="text-lg font-bold text-zinc-200">
                    {data.envBoot.optional_present}/{data.envBoot.optional_total}
                  </p>
                </div>
              </div>
              {data.envBoot.integrations.some(i => !i.configured) && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mb-4">
                  <h3 className="text-sm font-semibold text-amber-400 mb-2">Unconfigured Integrations</h3>
                  <div className="space-y-1">
                    {data.envBoot.integrations
                      .filter(i => !i.configured)
                      .map(i => (
                        <div key={i.system} className="flex items-start gap-2 text-xs">
                          <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                          <span className="text-zinc-300">
                            <strong>{i.system}</strong>
                            <span className="text-zinc-500 ml-1">— missing: {i.missing.join(', ')}</span>
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Services Grid */}
          <h2 className="text-lg font-semibold text-white mb-4">Services</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {data.services.map((svc) => (
              <div
                key={svc.name}
                className={`p-4 rounded-xl border ${getStatusColor(svc.status)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-zinc-900/50">
                      {getServiceIcon(svc.name)}
                    </div>
                    <div>
                      <h3 className="font-semibold">{svc.name}</h3>
                      <p className="text-sm opacity-75">{getStatusLabel(svc.status)}</p>
                    </div>
                  </div>
                  {getStatusIcon(svc.status)}
                </div>
                {svc.latency != null && (
                  <div className="mt-3 text-sm opacity-75">
                    Latency: {svc.latency}ms
                  </div>
                )}
                {svc.details && (
                  <div className="mt-2 text-sm opacity-75 bg-zinc-900/30 rounded p-2">
                    {svc.details}
                  </div>
                )}
                {svc.message && svc.status !== 'healthy' && (
                  <div className="mt-2 text-sm opacity-75 bg-zinc-900/30 rounded p-2">
                    {svc.message}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pipeline Health */}
          <h2 className="text-lg font-semibold text-white mb-4">Pipeline Health</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <PipelineCard
              label="Stuck Rendering"
              sublabel="> 2 hours"
              count={data.pipeline.stuckRendering}
              icon={<Timer className="w-5 h-5" />}
            />
            <PipelineCard
              label="Stuck Review"
              sublabel="> 24 hours"
              count={data.pipeline.stuckReview}
              icon={<AlertTriangle className="w-5 h-5" />}
            />
            <PipelineCard
              label="Failed"
              sublabel="Last 24h"
              count={data.pipeline.failedLast24h}
              icon={<XCircle className="w-5 h-5" />}
            />
          </div>

          {/* Usage Stats */}
          <h2 className="text-lg font-semibold text-white mb-4">Usage Stats</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <StatChip
              label="Total Users"
              value={data.usage.totalUsers.toLocaleString()}
              icon={<Users className="w-3 h-3 text-teal-400" />}
              size="md"
            />
            <StatChip
              label="Active (7 days)"
              value={data.usage.activeThisWeek.toLocaleString()}
              icon={<Activity className="w-3 h-3 text-green-400" />}
              size="md"
            />
            <StatChip
              label="Credits Today"
              value={data.usage.creditsConsumedToday.toLocaleString()}
              icon={<CreditCard className="w-3 h-3 text-amber-400" />}
              size="md"
            />
          </div>

          {/* Workflow Health */}
          {data.workflowHealth && (
            <>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5" /> Workflow Health
                <SeverityPill severity={data.workflowHealth.overallSeverity} />
              </h2>

              {/* Workflow Checks */}
              {data.workflowHealth.workflows.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  {data.workflowHealth.workflows.map((wf) => (
                    <div key={wf.name} className={`p-3 rounded-xl border ${getSeverityColor(wf.severity)}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-zinc-200">{wf.name}</span>
                        <SeverityPill severity={wf.severity} />
                      </div>
                      <p className="text-xs text-zinc-400">{wf.message}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Job Queue */}
              <div className={`p-4 rounded-xl border mb-4 ${getSeverityColor(data.workflowHealth.jobQueue.severity)}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                    <HardDrive className="w-4 h-4" /> Job Queue
                  </span>
                  <SeverityPill severity={data.workflowHealth.jobQueue.severity} />
                </div>
                <p className="text-xs text-zinc-400">{data.workflowHealth.jobQueue.message}</p>
                <div className="flex gap-4 mt-2 text-xs text-zinc-500">
                  <span>{data.workflowHealth.jobQueue.pending} pending</span>
                  <span>{data.workflowHealth.jobQueue.running} running</span>
                  <span>{data.workflowHealth.jobQueue.failed24h} failed (24h)</span>
                </div>
              </div>

              {/* Cron Freshness */}
              {data.workflowHealth.cronFreshness.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden mb-4">
                  <div className="px-4 py-3 border-b border-white/10">
                    <h3 className="text-sm font-semibold text-zinc-300">Cron Freshness</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="px-4 py-2 text-left text-zinc-400 font-medium text-xs">Cron</th>
                          <th className="px-4 py-2 text-left text-zinc-400 font-medium text-xs">Status</th>
                          <th className="px-4 py-2 text-left text-zinc-400 font-medium text-xs">Last Run</th>
                          <th className="px-4 py-2 text-left text-zinc-400 font-medium text-xs">Failures (24h)</th>
                          <th className="px-4 py-2 text-left text-zinc-400 font-medium text-xs">Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.workflowHealth.cronFreshness.map((cf) => (
                          <tr key={cf.job} className="border-b border-white/5 last:border-0">
                            <td className="px-4 py-2 text-zinc-200 text-xs font-medium">{cf.label}</td>
                            <td className="px-4 py-2"><SeverityPill severity={cf.severity} /></td>
                            <td className="px-4 py-2 text-zinc-400 text-xs">
                              {cf.lastRunAt ? new Date(cf.lastRunAt).toLocaleString() : '—'}
                            </td>
                            <td className="px-4 py-2 text-zinc-400 text-xs">
                              <span className={cf.recentFailures > 0 ? 'text-red-400' : ''}>{cf.recentFailures}</span>
                            </td>
                            <td className="px-4 py-2 text-zinc-400 text-xs">{cf.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Warnings */}
              {data.workflowHealth.warnings.length > 0 && (
                <div className="mb-4 space-y-1">
                  {data.workflowHealth.warnings.map((w, i) => (
                    <div key={i} className="text-xs text-amber-400 flex items-center gap-2">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {w}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Metrics System */}
          {data.metricsSystem && (
            <>
              <h2 className="text-lg font-semibold text-white mb-4">Metrics System</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="p-3 rounded-xl border border-white/10 bg-zinc-900/50">
                  <p className="text-xs text-zinc-500 mb-1">Total Snapshots</p>
                  <p className="text-lg font-bold text-zinc-200">{data.metricsSystem.totalSnapshots}</p>
                </div>
                <div className="p-3 rounded-xl border border-white/10 bg-zinc-900/50">
                  <p className="text-xs text-zinc-500 mb-1">Posts with Metrics</p>
                  <p className="text-lg font-bold text-zinc-200">{data.metricsSystem.postsWithMetrics}</p>
                </div>
                <div className="p-3 rounded-xl border border-white/10 bg-zinc-900/50">
                  <p className="text-xs text-zinc-500 mb-1">Posts without Metrics</p>
                  <p className="text-lg font-bold text-zinc-200">{data.metricsSystem.postsWithoutMetrics}</p>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4 mb-8">
                <h3 className="text-sm font-semibold text-zinc-300 mb-3">Providers</h3>
                <div className="space-y-2">
                  {Object.entries(data.metricsSystem.providers).map(([key, prov]) => (
                    <div key={key} className="flex items-center gap-3 text-xs">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${prov.enabled ? 'bg-green-400' : 'bg-zinc-600'}`} />
                      <span className="text-zinc-300 font-mono">{key}</span>
                      <span className="text-zinc-500">
                        {prov.enabled
                          ? prov.description || `Enabled (${prov.platform})`
                          : prov.reason || 'Disabled'}
                      </span>
                    </div>
                  ))}
                </div>
                {data.metricsSystem.lastSnapshot && (
                  <p className="text-xs text-zinc-500 mt-3">
                    Last snapshot: {new Date(data.metricsSystem.lastSnapshot).toLocaleString()}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Cron Jobs */}
          <h2 className="text-lg font-semibold text-white mb-4">Cron Jobs</h2>
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-left text-zinc-400 font-medium">Path</th>
                    <th className="px-4 py-3 text-left text-zinc-400 font-medium">Schedule</th>
                    <th className="px-4 py-3 text-left text-zinc-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cronJobs.map((job) => (
                    <tr key={job.path} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3 text-zinc-300 font-mono text-xs">{job.path}</td>
                      <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{job.schedule}</td>
                      <td className="px-4 py-3 text-zinc-300">{job.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function getSeverityColor(severity: Severity): string {
  switch (severity) {
    case 'healthy': return 'bg-green-500/10 border-green-500/20';
    case 'degraded': return 'bg-amber-500/10 border-amber-500/20';
    case 'critical': return 'bg-red-500/10 border-red-500/20';
    default: return 'bg-zinc-900/50 border-white/10';
  }
}

function SeverityPill({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    healthy: 'bg-green-500/15 text-green-400',
    degraded: 'bg-amber-500/15 text-amber-400',
    critical: 'bg-red-500/15 text-red-400',
    unknown: 'bg-zinc-500/15 text-zinc-400',
  };
  return (
    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wider ${styles[severity]}`}>
      {severity}
    </span>
  );
}

function PipelineCard({
  label,
  sublabel,
  count,
  icon,
}: {
  label: string;
  sublabel: string;
  count: number;
  icon: React.ReactNode;
}) {
  const hasIssues = count > 0;
  return (
    <div
      className={`p-4 rounded-xl border ${
        hasIssues
          ? 'bg-red-500/10 border-red-500/20'
          : 'bg-zinc-900/50 border-white/10'
      }`}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={hasIssues ? 'text-red-400' : 'text-zinc-500'}>{icon}</div>
        <div>
          <p className={`text-sm font-medium ${hasIssues ? 'text-red-400' : 'text-zinc-400'}`}>
            {label}
          </p>
          <p className="text-xs text-zinc-500">{sublabel}</p>
        </div>
      </div>
      <p className={`text-2xl font-bold ${hasIssues ? 'text-red-400' : 'text-zinc-300'}`}>
        {count}
      </p>
    </div>
  );
}

