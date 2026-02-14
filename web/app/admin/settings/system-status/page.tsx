'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity, RefreshCw, CheckCircle, AlertTriangle, XCircle,
  Clock, Database, Wifi, Video, Send, Film, Music, Scissors,
  Users, CreditCard, Timer, AlertCircle,
} from 'lucide-react';
import { SkeletonStats, SkeletonCard } from '@/components/ui/Skeleton';

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

interface SystemStatusData {
  ok: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: ServiceCheck[];
  pipeline: PipelineHealth;
  usage: UsageStats;
  cronJobs: CronJob[];
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
            <StatCard
              label="Total Users"
              value={data.usage.totalUsers}
              icon={<Users className="w-5 h-5 text-teal-400" />}
            />
            <StatCard
              label="Active (7 days)"
              value={data.usage.activeThisWeek}
              icon={<Activity className="w-5 h-5 text-green-400" />}
            />
            <StatCard
              label="Credits Today"
              value={data.usage.creditsConsumedToday}
              icon={<CreditCard className="w-5 h-5 text-amber-400" />}
            />
          </div>

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

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="p-4 rounded-xl border border-white/10 bg-zinc-900/50">
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <p className="text-sm font-medium text-zinc-400">{label}</p>
      </div>
      <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
    </div>
  );
}
