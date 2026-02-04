'use client';

import { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, FileText, Video, Zap,
  CheckCircle, ArrowRight, Sparkles, Calendar,
  CreditCard, Target, Users, Activity
} from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/Skeleton';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';

interface DashboardStats {
  scriptsGenerated: number;
  scriptsThisWeek: number;
  scriptsTrend: number;
  videosInQueue: number;
  videosCompleted: number;
  videosPending: number;
  creditsUsed: number;
  creditsRemaining: number;
  recentActivity: Array<{
    id: string;
    type: 'script' | 'video' | 'credit';
    action: string;
    timestamp: string;
    meta?: Record<string, unknown>;
  }>;
}

interface QuickAction {
  label: string;
  href: string;
  icon: React.ElementType;
  color: string;
  description: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Generate Script',
    href: '/admin/content-studio',
    icon: Sparkles,
    color: 'from-blue-500 to-violet-500',
    description: 'Create viral video scripts with AI',
  },
  {
    label: 'View Library',
    href: '/admin/skit-library',
    icon: FileText,
    color: 'from-teal-500 to-emerald-500',
    description: 'Browse your saved scripts',
  },
  {
    label: 'Video Pipeline',
    href: '/admin/video-pipeline',
    icon: Video,
    color: 'from-purple-500 to-pink-500',
    description: 'Track video production status',
  },
  {
    label: 'Schedule Content',
    href: '/admin/calendar',
    icon: Calendar,
    color: 'from-amber-500 to-orange-500',
    description: 'Plan your posting schedule',
  },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');

  useEffect(() => {
    fetchDashboardStats();
  }, [timeRange]);

  const fetchDashboardStats = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/dashboard/stats?range=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'script': return FileText;
      case 'video': return Video;
      case 'credit': return CreditCard;
      default: return Activity;
    }
  };

  return (
    <div className="px-4 py-6 pb-24 lg:pb-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-zinc-400">Welcome back! Here&apos;s your content overview.</p>
        </div>
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                timeRange === range
                  ? 'bg-teal-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Onboarding Checklist */}
      <OnboardingChecklist className="mb-2" />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <Skeleton height={16} width="50%" className="mb-2" />
              <Skeleton height={32} width="40%" className="mb-2" />
              <Skeleton height={14} width="60%" />
            </div>
          ))
        ) : (
          <>
            {/* Scripts Generated */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 mb-2">
                <FileText className="w-4 h-4" />
                <span className="text-sm">Scripts Generated</span>
              </div>
              <div className="text-2xl font-bold text-white mb-1">
                {stats?.scriptsGenerated || 0}
              </div>
              <div className="flex items-center gap-1 text-sm">
                {(stats?.scriptsTrend || 0) >= 0 ? (
                  <>
                    <TrendingUp className="w-3 h-3 text-green-400" />
                    <span className="text-green-400">+{stats?.scriptsTrend || 0}%</span>
                  </>
                ) : (
                  <>
                    <TrendingDown className="w-3 h-3 text-red-400" />
                    <span className="text-red-400">{stats?.scriptsTrend}%</span>
                  </>
                )}
                <span className="text-zinc-500">vs last period</span>
              </div>
            </div>

            {/* Videos in Queue */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 mb-2">
                <Video className="w-4 h-4" />
                <span className="text-sm">Videos in Queue</span>
              </div>
              <div className="text-2xl font-bold text-white mb-1">
                {stats?.videosInQueue || 0}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-500">{stats?.videosPending || 0} pending</span>
                <span className="text-zinc-600">·</span>
                <span className="text-green-400">{stats?.videosCompleted || 0} completed</span>
              </div>
            </div>

            {/* Credits Used */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 mb-2">
                <Zap className="w-4 h-4" />
                <span className="text-sm">Credits This Month</span>
              </div>
              <div className="text-2xl font-bold text-white mb-1">
                {stats?.creditsUsed || 0}
              </div>
              <div className="text-sm text-zinc-500">
                {stats?.creditsRemaining || 0} remaining
              </div>
            </div>

            {/* Quick Stat */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 mb-2">
                <Target className="w-4 h-4" />
                <span className="text-sm">This Week</span>
              </div>
              <div className="text-2xl font-bold text-white mb-1">
                {stats?.scriptsThisWeek || 0}
              </div>
              <div className="text-sm text-zinc-500">
                scripts generated
              </div>
            </div>
          </>
        )}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-all"
              >
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-r ${action.color} flex items-center justify-center mb-3`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-white group-hover:text-teal-400 transition-colors">
                      {action.label}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">{action.description}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-teal-400 group-hover:translate-x-1 transition-all" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
            <Link href="/admin/activity" className="text-sm text-teal-400 hover:text-teal-300">
              View all
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton width={32} height={32} variant="circular" />
                  <div className="flex-1">
                    <Skeleton height={16} width="80%" className="mb-1" />
                    <Skeleton height={12} width="40%" />
                  </div>
                </div>
              ))}
            </div>
          ) : stats?.recentActivity && stats.recentActivity.length > 0 ? (
            <div className="space-y-3">
              {stats.recentActivity.map((activity) => {
                const Icon = getActivityIcon(activity.type);
                return (
                  <div key={activity.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{activity.action}</p>
                      <p className="text-xs text-zinc-500">{formatTimeAgo(activity.timestamp)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">No recent activity</p>
              <Link href="/admin/content-studio" className="text-sm text-teal-400 hover:text-teal-300 mt-2 inline-block">
                Generate your first script
              </Link>
            </div>
          )}
        </div>

        {/* Getting Started / Tips */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Getting Started</h2>
          <div className="space-y-3">
            <Link href="/admin/products" className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors">
              <div className="w-8 h-8 rounded-full bg-teal-500/20 flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-teal-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Add your products</p>
                <p className="text-xs text-zinc-500">Import or create products to generate content for</p>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-500" />
            </Link>

            <Link href="/admin/audience" className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Users className="w-4 h-4 text-purple-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Define your audience</p>
                <p className="text-xs text-zinc-500">Create personas for targeted content</p>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-500" />
            </Link>

            <Link href="/admin/winners" className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Target className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Save winning videos</p>
                <p className="text-xs text-zinc-500">Add reference videos for AI to learn from</p>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-500" />
            </Link>

            <Link href="/admin/content-studio" className="flex items-center gap-3 p-3 bg-gradient-to-r from-blue-500/10 to-violet-500/10 border border-blue-500/20 rounded-lg hover:border-blue-500/40 transition-colors">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Generate your first script</p>
                <p className="text-xs text-zinc-400">Use AI to create viral video content</p>
              </div>
              <ArrowRight className="w-4 h-4 text-blue-400" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
