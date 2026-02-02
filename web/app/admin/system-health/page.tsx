'use client';

import { useState, useEffect } from 'react';
import AppLayout from '../../components/AppLayout';
import {
  Activity, RefreshCw, CheckCircle, AlertTriangle, XCircle,
  Clock, Server, Database, Cpu, Wifi
} from 'lucide-react';

interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  message?: string;
  lastChecked: string;
}

interface HealthData {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheck[];
  totalLatency: number;
  timestamp: string;
  environment: string;
  version: string;
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchHealth = async (showRefreshing = true) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const res = await fetch('/api/admin/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (err) {
      console.error('Failed to fetch health:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth(false);
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => fetchHealth(false), 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case 'unhealthy':
        return <XCircle className="w-5 h-5 text-red-400" />;
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
      default:
        return 'bg-zinc-500/20 border-zinc-500/30 text-zinc-400';
    }
  };

  const getServiceIcon = (name: string) => {
    switch (name.toLowerCase()) {
      case 'supabase':
        return <Database className="w-5 h-5" />;
      case 'replicate':
        return <Cpu className="w-5 h-5" />;
      case 'openai':
        return <Server className="w-5 h-5" />;
      case 'elevenlabs':
        return <Wifi className="w-5 h-5" />;
      default:
        return <Activity className="w-5 h-5" />;
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="p-6 lg:p-8 max-w-4xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-48 bg-zinc-800 rounded" />
            <div className="h-32 bg-zinc-800/50 rounded-xl" />
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-24 bg-zinc-800/50 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto pb-24 lg:pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">System Health</h1>
            <p className="text-zinc-400">Monitor service status and connectivity</p>
          </div>
          <div className="flex items-center gap-3">
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
              onClick={() => fetchHealth()}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {health && (
          <>
            {/* Overall Status */}
            <div className={`mb-6 p-6 rounded-xl border ${getStatusColor(health.status)}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon(health.status)}
                  <div>
                    <h2 className="text-lg font-semibold capitalize">{health.status}</h2>
                    <p className="text-sm opacity-75">
                      All systems {health.status === 'healthy' ? 'operational' : 'experiencing issues'}
                    </p>
                  </div>
                </div>
                <div className="text-right text-sm opacity-75">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {health.totalLatency}ms total
                  </div>
                  <div>Last checked: {new Date(health.timestamp).toLocaleTimeString()}</div>
                </div>
              </div>
            </div>

            {/* Service Checks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {health.checks.map((check) => (
                <div
                  key={check.name}
                  className={`p-4 rounded-xl border ${getStatusColor(check.status)}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-zinc-900/50">
                        {getServiceIcon(check.name)}
                      </div>
                      <div>
                        <h3 className="font-semibold">{check.name}</h3>
                        <p className="text-sm opacity-75 capitalize">{check.status}</p>
                      </div>
                    </div>
                    {getStatusIcon(check.status)}
                  </div>
                  {check.latency !== undefined && (
                    <div className="mt-3 text-sm opacity-75">
                      Latency: {check.latency}ms
                    </div>
                  )}
                  {check.message && (
                    <div className="mt-2 text-sm opacity-75 bg-zinc-900/30 rounded p-2">
                      {check.message}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* System Info */}
            <div className="p-6 rounded-xl border border-white/10 bg-zinc-900/50">
              <h2 className="text-lg font-semibold text-white mb-4">System Information</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-zinc-400">Environment:</span>
                  <span className="ml-2 text-white capitalize">{health.environment}</span>
                </div>
                <div>
                  <span className="text-zinc-400">Version:</span>
                  <span className="ml-2 text-white">{health.version}</span>
                </div>
                <div>
                  <span className="text-zinc-400">Healthy Services:</span>
                  <span className="ml-2 text-green-400">
                    {health.checks.filter(c => c.status === 'healthy').length}/{health.checks.length}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400">Total Latency:</span>
                  <span className="ml-2 text-white">{health.totalLatency}ms</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
