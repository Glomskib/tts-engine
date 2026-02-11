'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity, Server, Database, Clock, AlertTriangle, CheckCircle,
  RefreshCw, Wifi, WifiOff, BarChart3, Loader2, Zap, XCircle,
} from 'lucide-react';

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'down';
  response_time_ms: number;
  timestamp: string;
}

interface QueueSummary {
  counts_by_status: Record<string, number>;
  total_queued: number;
}

interface StuckItem {
  id: string;
  video_code: string | null;
  status: string;
  recording_status: string | null;
  age_hours: number;
}

interface ThroughputData {
  period: string;
  videos_created: number;
  videos_posted: number;
  avg_time_to_post_hours: number;
}

interface SystemStatus {
  api: HealthCheck;
  database: HealthCheck;
  queue: { summary: QueueSummary | null; error: string | null };
  stuck: StuckItem[];
  throughput: ThroughputData | null;
}

async function checkEndpoint(url: string): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const elapsed = Date.now() - start;
    const data = await res.json();
    return {
      status: res.ok && data.ok !== false ? 'healthy' : 'degraded',
      response_time_ms: elapsed,
      timestamp: new Date().toISOString(),
    };
  } catch {
    return {
      status: 'down',
      response_time_ms: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  }
}

export default function MonitoringPage() {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const runChecks = useCallback(async () => {
    setRefreshing(true);
    try {
      // Run all checks in parallel
      const [apiHealth, dbHealth, queueRes, stuckRes, throughputRes] = await Promise.all([
        checkEndpoint('/api/health'),
        checkEndpoint('/api/observability/health'),
        fetch('/api/observability/queue-summary').then(r => r.json()).catch(() => null),
        fetch('/api/observability/stuck').then(r => r.json()).catch(() => null),
        fetch('/api/observability/throughput').then(r => r.json()).catch(() => null),
      ]);

      setSystemStatus({
        api: apiHealth,
        database: dbHealth,
        queue: {
          summary: queueRes?.data || null,
          error: queueRes?.ok === false ? queueRes.message : null,
        },
        stuck: (stuckRes?.data || []).slice(0, 10),
        throughput: throughputRes?.data || null,
      });
      setLastRefresh(new Date());
    } catch {
      // partial failure is ok
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { runChecks(); }, [runChecks]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(runChecks, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, runChecks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
      </div>
    );
  }

  const status = systemStatus!;
  const overallStatus = status.api.status === 'healthy' && status.database.status === 'healthy'
    ? 'healthy'
    : status.api.status === 'down' || status.database.status === 'down'
      ? 'down'
      : 'degraded';

  return (
    <div className="max-w-6xl mx-auto pb-24 lg:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-teal-400" />
          <div>
            <h1 className="text-xl font-bold text-white">System Monitoring</h1>
            <p className="text-xs text-zinc-500">
              {lastRefresh ? `Last check: ${lastRefresh.toLocaleTimeString()}` : 'Running checks...'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-zinc-700"
            />
            Auto-refresh
          </label>
          <button
            onClick={runChecks}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 text-zinc-400 rounded-lg text-xs hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Overall Status Banner */}
      <div className={`mb-6 p-4 rounded-xl border ${
        overallStatus === 'healthy' ? 'bg-green-500/5 border-green-500/30' :
        overallStatus === 'degraded' ? 'bg-yellow-500/5 border-yellow-500/30' :
        'bg-red-500/5 border-red-500/30'
      }`}>
        <div className="flex items-center gap-3">
          {overallStatus === 'healthy' ? (
            <CheckCircle className="w-6 h-6 text-green-400" />
          ) : overallStatus === 'degraded' ? (
            <AlertTriangle className="w-6 h-6 text-yellow-400" />
          ) : (
            <XCircle className="w-6 h-6 text-red-400" />
          )}
          <div>
            <div className={`text-sm font-bold ${
              overallStatus === 'healthy' ? 'text-green-400' :
              overallStatus === 'degraded' ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {overallStatus === 'healthy' ? 'All Systems Operational' :
               overallStatus === 'degraded' ? 'Degraded Performance' :
               'System Issues Detected'}
            </div>
            <div className="text-xs text-zinc-500">
              API: {status.api.response_time_ms}ms | DB: {status.database.response_time_ms}ms
            </div>
          </div>
        </div>
      </div>

      {/* Service Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <ServiceCard
          name="API Server"
          icon={Server}
          status={status.api.status}
          responseTime={status.api.response_time_ms}
        />
        <ServiceCard
          name="Database"
          icon={Database}
          status={status.database.status}
          responseTime={status.database.response_time_ms}
        />
        <ServiceCard
          name="Queue"
          icon={Zap}
          status={status.queue.summary ? 'healthy' : 'degraded'}
          detail={status.queue.summary ? `${status.queue.summary.total_queued} in queue` : 'No data'}
        />
        <ServiceCard
          name="Pipeline"
          icon={Activity}
          status={status.stuck.length === 0 ? 'healthy' : status.stuck.length <= 3 ? 'degraded' : 'down'}
          detail={status.stuck.length === 0 ? 'No stuck items' : `${status.stuck.length} stuck`}
        />
      </div>

      {/* Queue Distribution */}
      {status.queue.summary && (
        <div className="mb-6 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
          <h2 className="text-sm font-semibold text-zinc-400 mb-3">Queue Distribution</h2>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(status.queue.summary.counts_by_status || {}).map(([statusKey, count]) => (
              <div key={statusKey} className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 rounded-lg">
                <span className="text-xs text-zinc-400">{statusKey.replace(/_/g, ' ')}</span>
                <span className="text-sm font-bold text-white">{count as number}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Throughput */}
      {status.throughput && (
        <div className="mb-6 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
          <h2 className="text-sm font-semibold text-zinc-400 mb-3">Throughput (7 days)</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Videos Created</div>
              <div className="text-2xl font-bold text-white">{status.throughput.videos_created}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Videos Posted</div>
              <div className="text-2xl font-bold text-green-400">{status.throughput.videos_posted}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Avg Time to Post</div>
              <div className="text-2xl font-bold text-zinc-300">
                {status.throughput.avg_time_to_post_hours > 0
                  ? `${Math.round(status.throughput.avg_time_to_post_hours)}h`
                  : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stuck Items */}
      {status.stuck.length > 0 && (
        <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
          <h2 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Stuck Items ({status.stuck.length})
          </h2>
          <div className="space-y-2">
            {status.stuck.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                <div>
                  <span className="text-sm text-zinc-300 font-mono">{item.video_code || item.id.slice(0, 8)}</span>
                  <span className="ml-2 text-xs text-zinc-500">{item.recording_status || item.status}</span>
                </div>
                <span className="text-xs text-red-400 font-medium">
                  <Clock className="w-3 h-3 inline mr-1" />
                  {Math.round(item.age_hours)}h stuck
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ServiceCard({
  name,
  icon: Icon,
  status,
  responseTime,
  detail,
}: {
  name: string;
  icon: typeof Server;
  status: 'healthy' | 'degraded' | 'down';
  responseTime?: number;
  detail?: string;
}) {
  const StatusIcon = status === 'healthy' ? Wifi : status === 'degraded' ? AlertTriangle : WifiOff;
  const statusColor = status === 'healthy' ? 'text-green-400' :
    status === 'degraded' ? 'text-yellow-400' : 'text-red-400';
  const borderColor = status === 'healthy' ? 'border-green-500/20' :
    status === 'degraded' ? 'border-yellow-500/20' : 'border-red-500/20';

  return (
    <div className={`p-4 bg-zinc-900/50 border rounded-xl ${borderColor}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-4 h-4 text-zinc-500" />
        <StatusIcon className={`w-4 h-4 ${statusColor}`} />
      </div>
      <div className="text-sm font-semibold text-white">{name}</div>
      <div className="text-xs text-zinc-500 mt-1">
        {responseTime !== undefined ? `${responseTime}ms` : detail || ''}
      </div>
      <div className={`text-[10px] font-bold uppercase mt-1 ${statusColor}`}>{status}</div>
    </div>
  );
}
