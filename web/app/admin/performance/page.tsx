'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Clock, AlertTriangle,
  TrendingUp, Users, Video, RefreshCw, ArrowRight
} from 'lucide-react';

interface PerformanceStats {
  totalVideos: number;
  completedThisMonth: number;
  avgTurnaroundHours: number;
  slaBreaches: number;
  slaCompliance: number;
  activeClients: number;
  pendingRequests: number;
  inProgress: number;
  completedToday: number;
  overdueCount: number;
}

interface RecentActivity {
  id: string;
  type: string;
  title: string;
  status: string;
  timestamp: string;
}

export default function PerformancePage() {
  const [stats, setStats] = useState<PerformanceStats>({
    totalVideos: 0,
    completedThisMonth: 0,
    avgTurnaroundHours: 0,
    slaBreaches: 0,
    slaCompliance: 100,
    activeClients: 0,
    pendingRequests: 0,
    inProgress: 0,
    completedToday: 0,
    overdueCount: 0,
  });
  const [, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/admin/performance');
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats || data);
        setRecentActivity(data.recentActivity || []);
      }
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const statCards = [
    {
      label: 'Completed This Month',
      value: stats.completedThisMonth,
      icon: Video,
      color: 'text-teal-400',
      bgColor: 'bg-teal-400/10',
      borderColor: 'border-teal-500/20',
    },
    {
      label: 'Avg Turnaround',
      value: `${stats.avgTurnaroundHours}h`,
      icon: Clock,
      color: 'text-blue-400',
      bgColor: 'bg-blue-400/10',
      borderColor: 'border-blue-500/20',
    },
    {
      label: 'SLA Breaches',
      value: stats.slaBreaches,
      icon: AlertTriangle,
      color: stats.slaBreaches > 0 ? 'text-red-400' : 'text-green-400',
      bgColor: stats.slaBreaches > 0 ? 'bg-red-400/10' : 'bg-green-400/10',
      borderColor: stats.slaBreaches > 0 ? 'border-red-500/20' : 'border-green-500/20',
    },
    {
      label: 'Active Clients',
      value: stats.activeClients,
      icon: Users,
      color: 'text-purple-400',
      bgColor: 'bg-purple-400/10',
      borderColor: 'border-purple-500/20',
    },
    {
      label: 'Pending Requests',
      value: stats.pendingRequests,
      icon: Clock,
      color: stats.pendingRequests > 5 ? 'text-yellow-400' : 'text-zinc-400',
      bgColor: stats.pendingRequests > 5 ? 'bg-yellow-400/10' : 'bg-zinc-400/10',
      borderColor: stats.pendingRequests > 5 ? 'border-yellow-500/20' : 'border-zinc-500/20',
    },
    {
      label: 'In Progress',
      value: stats.inProgress,
      icon: TrendingUp,
      color: 'text-orange-400',
      bgColor: 'bg-orange-400/10',
      borderColor: 'border-orange-500/20',
    },
  ];

  if (loading) {
    return (
      <div className="px-4 py-6 pb-24 lg:pb-8 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-zinc-800 rounded" />
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-28 bg-zinc-800/50 rounded-xl" />
            ))}
          </div>
          <div className="h-40 bg-zinc-800/50 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 pb-24 lg:pb-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Performance Dashboard</h1>
          <p className="text-zinc-400">Video production metrics and KPIs</p>
        </div>
        <button
          onClick={() => fetchStats(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className={`bg-zinc-900 border ${stat.borderColor} rounded-xl p-5 transition-colors hover:bg-zinc-800/50`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-sm text-zinc-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* SLA Compliance */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">SLA Compliance</h2>
          <span className={`text-2xl font-bold ${
            stats.slaCompliance >= 95 ? 'text-green-400' :
            stats.slaCompliance >= 80 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {stats.slaCompliance}%
          </span>
        </div>
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1 bg-zinc-800 rounded-full h-4 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                stats.slaCompliance >= 95 ? 'bg-green-500' :
                stats.slaCompliance >= 80 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${stats.slaCompliance}%` }}
            />
          </div>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">
            {stats.completedThisMonth - stats.slaBreaches} of {stats.completedThisMonth} videos delivered on time
          </span>
          {stats.overdueCount > 0 && (
            <span className="text-red-400">
              {stats.overdueCount} currently overdue
            </span>
          )}
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Turnaround Breakdown */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Turnaround Time</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Rush (24h SLA)</span>
              <span className="text-white font-medium">~{Math.round(stats.avgTurnaroundHours * 0.5)}h avg</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Priority (48h SLA)</span>
              <span className="text-white font-medium">~{Math.round(stats.avgTurnaroundHours * 0.8)}h avg</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Standard (72h SLA)</span>
              <span className="text-white font-medium">~{stats.avgTurnaroundHours}h avg</span>
            </div>
          </div>
        </div>

        {/* Workload */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Current Workload</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Pending Review</span>
              <span className="text-yellow-400 font-medium">{stats.pendingRequests}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">In Production</span>
              <span className="text-blue-400 font-medium">{stats.inProgress}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Completed Today</span>
              <span className="text-green-400 font-medium">{stats.completedToday}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Total This Month</span>
              <span className="text-white font-medium">{stats.completedThisMonth}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-4">
        <Link
          href="/admin/pipeline"
          className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-teal-500/30 hover:bg-zinc-800/50 transition-all group"
        >
          <div>
            <h3 className="font-medium text-white mb-1">Video Pipeline</h3>
            <p className="text-sm text-zinc-500">{stats.inProgress} videos in progress</p>
          </div>
          <ArrowRight className="w-5 h-5 text-zinc-600 group-hover:text-teal-400 transition-colors" />
        </Link>
        <Link
          href="/admin/requests"
          className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-teal-500/30 hover:bg-zinc-800/50 transition-all group"
        >
          <div>
            <h3 className="font-medium text-white mb-1">Client Requests</h3>
            <p className="text-sm text-zinc-500">{stats.pendingRequests} pending</p>
          </div>
          <ArrowRight className="w-5 h-5 text-zinc-600 group-hover:text-teal-400 transition-colors" />
        </Link>
        <Link
          href="/admin/clients"
          className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-teal-500/30 hover:bg-zinc-800/50 transition-all group"
        >
          <div>
            <h3 className="font-medium text-white mb-1">Clients</h3>
            <p className="text-sm text-zinc-500">{stats.activeClients} active</p>
          </div>
          <ArrowRight className="w-5 h-5 text-zinc-600 group-hover:text-teal-400 transition-colors" />
        </Link>
      </div>
    </div>
  );
}
