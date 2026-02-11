'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Video, Upload, Calendar, Bell, Sparkles,
  ArrowRight, TrendingUp, TrendingDown, Activity,
  AlertTriangle, Clock, Eye, FileText, Users, Trophy,
  CheckCircle, Lightbulb, RefreshCw, Zap, Star, Plus,
  ChevronRight, Package, Loader2
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/Skeleton';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { useToast } from '@/contexts/ToastContext';
import { CONTENT_TYPES } from '@/lib/content-types';

const WeeklyChart = dynamic(() => import('./WeeklyChart'), { ssr: false });
const SetupChecklist = dynamic(() => import('./SetupChecklist'), { ssr: false });

function getContentTypeName(id: string): string {
  const ct = CONTENT_TYPES.find(c => c.id === id);
  return ct?.name || id;
}

interface SOTDItem {
  id: string;
  product_id: string;
  product_name: string;
  brand: string;
  content_type: string;
  hook: string;
  script_body: string;
  score: number;
  added_to_pipeline: boolean;
}

interface Recommendation {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: number;
  product_id?: string;
  product_name?: string;
  content_type?: string;
  hook_suggestion?: string;
  studio_params: Record<string, string>;
}

interface DashboardData {
  postedThisWeek: number;
  postedTrend: number;
  inPipeline: number;
  pipelineByStatus: Record<string, number>;
  vaQueue: number;
  unreadAlerts: number;
  avgDaysInPipeline: number;
  bottleneck: string | null;
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    created_at: string;
  }>;
  weekCalendar: Array<{
    date: string;
    dayName: string;
    dayNum: number;
    posted: number;
    scheduled: number;
    isToday: boolean;
  }>;
  winnersCount: number;
  scriptsCount: number;
  totalVideos: number;
}

const QUICK_ACTIONS = [
  {
    label: 'Generate Scripts',
    href: '/admin/content-studio',
    icon: Sparkles,
    color: 'bg-blue-500/20 text-blue-400',
    description: 'AI content studio',
  },
  {
    label: 'Upload Video',
    href: '/admin/upload',
    icon: Upload,
    color: 'bg-amber-500/20 text-amber-400',
    description: 'Upload raw or edited video',
  },
  {
    label: 'Import Winner',
    href: '/admin/winners/import',
    icon: Trophy,
    color: 'bg-yellow-500/20 text-yellow-400',
    description: 'Add winning TikTok videos',
  },
  {
    label: 'Video Pipeline',
    href: '/admin/pipeline',
    icon: Video,
    color: 'bg-purple-500/20 text-purple-400',
    description: 'Track video production',
  },
  {
    label: 'Calendar',
    href: '/admin/calendar',
    icon: Calendar,
    color: 'bg-teal-500/20 text-teal-400',
    description: 'Plan posting schedule',
  },
  {
    label: 'Content Package',
    href: '/admin/content-package',
    icon: Package,
    color: 'bg-violet-500/20 text-violet-400',
    description: 'Daily AI script batches',
  },
];

const STATUS_COLORS: Record<string, string> = {
  SCRIPT_READY: 'bg-blue-500',
  RECORDING: 'bg-purple-500',
  EDITING: 'bg-amber-500',
  REVIEW: 'bg-orange-500',
  SCHEDULED: 'bg-teal-500',
  READY_TO_POST: 'bg-green-500',
  POSTED: 'bg-emerald-500',
  LIVE: 'bg-emerald-400',
  ARCHIVED: 'bg-zinc-600',
};

const STATUS_LABELS: Record<string, string> = {
  SCRIPT_READY: 'Script Ready',
  RECORDING: 'Recording',
  EDITING: 'Editing',
  REVIEW: 'Review',
  SCHEDULED: 'Scheduled',
  READY_TO_POST: 'Ready',
  POSTED: 'Posted',
  LIVE: 'Live',
};

function formatTimeAgo(timestamp: string) {
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
}

function getActivityIcon(type: string) {
  switch (type) {
    case 'video_status': return Video;
    case 'winner_detected': return Trophy;
    case 'va_submission': return Users;
    case 'pipeline_alert': return AlertTriangle;
    default: return Bell;
  }
}

export default function DashboardPage() {
  const { showSuccess, showError } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(true);
  const [sotd, setSotd] = useState<SOTDItem | null>(null);
  const [sotdRunnerUp, setSotdRunnerUp] = useState<SOTDItem | null>(null);
  const [sotdLoading, setSotdLoading] = useState(true);
  const [addingToPipeline, setAddingToPipeline] = useState(false);
  const [weeklyData, setWeeklyData] = useState<Array<{ day: string; scripts: number; posted: number }>>([]);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard/stats');
      if (response.ok) {
        const json = await response.json();
        setData(json.data || json);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRecommendations = useCallback(async () => {
    setRecsLoading(true);
    try {
      const response = await fetch('/api/ai/recommend-content');
      if (response.ok) {
        const json = await response.json();
        setRecommendations(json.data?.recommendations || []);
      }
    } catch (error) {
      console.error('Failed to fetch recommendations:', error);
    } finally {
      setRecsLoading(false);
    }
  }, []);

  const fetchSOTD = useCallback(async () => {
    setSotdLoading(true);
    try {
      const response = await fetch('/api/content-package/generate');
      if (response.ok) {
        const json = await response.json();
        const items: SOTDItem[] = json.data?.items || [];
        if (items.length > 0) {
          const sorted = [...items].sort((a, b) => b.score - a.score);
          const seen = new Set<string>();
          const topPicks: SOTDItem[] = [];
          for (const item of sorted) {
            if (!seen.has(item.product_name)) {
              seen.add(item.product_name);
              topPicks.push(item);
              if (topPicks.length >= 2) break;
            }
          }
          setSotd(topPicks[0] || null);
          setSotdRunnerUp(topPicks[1] || null);
        }
      }
    } catch (error) {
      console.error('Failed to fetch SOTD:', error);
    } finally {
      setSotdLoading(false);
    }
  }, []);

  const fetchWeeklyData = useCallback(async () => {
    try {
      const response = await fetch('/api/analytics?type=throughput&days=7');
      if (response.ok) {
        const json = await response.json();
        const throughput: Record<string, unknown>[] = json.data?.throughput || [];
        const mapped = throughput.map((d) => {
          const date = new Date(d.date as string);
          const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
          const posted = Number(d.POSTED || 0) + Number(d.LIVE || 0);
          const total = Object.entries(d).reduce((sum, [key, val]) => {
            if (key === 'date') return sum;
            return sum + Number(val || 0);
          }, 0);
          return { day: dayName, scripts: total, posted };
        });
        setWeeklyData(mapped);
      }
    } catch (error) {
      console.error('Failed to fetch weekly data:', error);
    }
  }, []);

  useEffect(() => { fetchData(); fetchRecommendations(); fetchSOTD(); fetchWeeklyData(); }, [fetchData, fetchRecommendations, fetchSOTD, fetchWeeklyData]);

  const activeStatuses = ['SCRIPT_READY', 'RECORDING', 'EDITING', 'REVIEW', 'SCHEDULED', 'READY_TO_POST'];
  const totalActive = data ? activeStatuses.reduce((sum, s) => sum + (data.pipelineByStatus[s] || 0), 0) : 0;

  // New user = zero content across all metrics (show welcome card instead of empty charts)
  const isNewUser = !loading && data !== null &&
    (data.totalVideos || 0) === 0 &&
    (data.scriptsCount || 0) === 0 &&
    (data.winnersCount || 0) === 0;

  return (
    <PullToRefresh onRefresh={fetchData}>
      <div className="px-4 py-6 pb-24 lg:pb-8 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-zinc-400 text-sm">Your content operations at a glance</p>
        </div>

        {/* Welcome Card — shown to new users with zero content */}
        {isNewUser && (
          <div className="bg-gradient-to-br from-teal-500/10 via-zinc-900 to-violet-500/10 border border-teal-500/20 rounded-xl p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-violet-600 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Welcome to FlashFlow</h2>
                <p className="text-sm text-zinc-400">Let&apos;s get your first video script created in 3 steps</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
              <Link href="/admin/products" className="group flex items-start gap-3 p-4 bg-zinc-800/60 border border-zinc-700/50 rounded-lg hover:border-teal-500/30 transition-all">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 text-sm font-bold">1</div>
                <div>
                  <p className="text-sm font-medium text-white group-hover:text-teal-400 transition-colors">Add a Product</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Tell FlashFlow what you sell so AI can write about it</p>
                </div>
              </Link>
              <Link href="/admin/content-studio" className="group flex items-start gap-3 p-4 bg-zinc-800/60 border border-zinc-700/50 rounded-lg hover:border-teal-500/30 transition-all">
                <div className="w-8 h-8 rounded-lg bg-violet-500/20 text-violet-400 flex items-center justify-center shrink-0 text-sm font-bold">2</div>
                <div>
                  <p className="text-sm font-medium text-white group-hover:text-teal-400 transition-colors">Generate a Script</p>
                  <p className="text-xs text-zinc-500 mt-0.5">AI writes scroll-stopping hooks and full video scripts</p>
                </div>
              </Link>
              <Link href="/admin/pipeline" className="group flex items-start gap-3 p-4 bg-zinc-800/60 border border-zinc-700/50 rounded-lg hover:border-teal-500/30 transition-all">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 text-sm font-bold">3</div>
                <div>
                  <p className="text-sm font-medium text-white group-hover:text-teal-400 transition-colors">Film &amp; Post</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Track your videos from script to TikTok</p>
                </div>
              </Link>
            </div>
          </div>
        )}

        {/* Setup Checklist — shown until all steps done or user dismisses */}
        {!loading && data && (
          <SetupChecklist
            scriptsCount={data.scriptsCount || 0}
            totalVideos={data.totalVideos || 0}
            winnersCount={data.winnersCount || 0}
          />
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <Skeleton height={14} width="60%" className="mb-2" />
                <Skeleton height={28} width="40%" className="mb-1" />
                <Skeleton height={12} width="50%" />
              </div>
            ))
          ) : (
            <>
              {/* Posted This Week */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span className="text-xs">Posted This Week</span>
                </div>
                <div className="text-2xl font-bold text-white">{data?.postedThisWeek || 0}</div>
                <div className="flex items-center gap-1 text-xs mt-0.5">
                  {(data?.postedTrend || 0) >= 0 ? (
                    <><TrendingUp className="w-3 h-3 text-green-400" /><span className="text-green-400">+{data?.postedTrend || 0}%</span></>
                  ) : (
                    <><TrendingDown className="w-3 h-3 text-red-400" /><span className="text-red-400">{data?.postedTrend}%</span></>
                  )}
                  <span className="text-zinc-500">vs last week</span>
                </div>
              </div>

              {/* In Pipeline */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                  <Video className="w-3.5 h-3.5" />
                  <span className="text-xs">In Pipeline</span>
                </div>
                <div className="text-2xl font-bold text-white">{data?.inPipeline || 0}</div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {data?.avgDaysInPipeline || 0}d avg cycle
                </div>
              </div>

              {/* VA Queue */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                  <Users className="w-3.5 h-3.5" />
                  <span className="text-xs">VA Queue</span>
                </div>
                <div className="text-2xl font-bold text-white">{data?.vaQueue || 0}</div>
                <div className="text-xs text-zinc-500 mt-0.5">assigned videos</div>
              </div>

              {/* Library Stats */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                  <FileText className="w-3.5 h-3.5" />
                  <span className="text-xs">Content Library</span>
                </div>
                <div className="text-2xl font-bold text-white">{data?.scriptsCount || 0}</div>
                <div className="flex items-center gap-1 text-xs mt-0.5">
                  <Trophy className="w-3 h-3 text-amber-400" />
                  <span className="text-zinc-500">{data?.winnersCount || 0} winners</span>
                </div>
              </div>

              {/* Unread Alerts */}
              <Link href="/admin/notifications" className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors col-span-2 lg:col-span-1">
                <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                  <Bell className="w-3.5 h-3.5" />
                  <span className="text-xs">Unread Alerts</span>
                </div>
                <div className={`text-2xl font-bold ${(data?.unreadAlerts || 0) > 0 ? 'text-red-400' : 'text-white'}`}>
                  {data?.unreadAlerts || 0}
                </div>
                <div className="text-xs text-teal-400 mt-0.5 flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </div>
              </Link>
            </>
          )}
        </div>

        {/* Script of the Day */}
        {sotdLoading ? (
          <div className="bg-gradient-to-r from-zinc-900 to-zinc-900/80 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-white">Script of the Day</h2>
            </div>
            <Skeleton height={60} width="100%" />
          </div>
        ) : sotd ? (
          <div className="bg-gradient-to-r from-amber-500/5 via-zinc-900 to-zinc-900 border border-amber-500/20 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-white">Script of the Day</h2>
              </div>
              <Link href="/admin/content-package" className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1">
                See all scripts <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 bg-zinc-800/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">
                    Score {sotd.score}/9
                  </span>
                  <span className="text-xs text-zinc-500">{getContentTypeName(sotd.content_type)}</span>
                </div>
                <p className="text-white font-medium text-sm leading-snug mb-2">&ldquo;{sotd.hook}&rdquo;</p>
                <p className="text-xs text-zinc-400">{sotd.product_name} &middot; {sotd.brand}</p>
                <div className="mt-3 flex items-center gap-2">
                  <Link
                    href={`/admin/content-studio?product=${encodeURIComponent(sotd.product_name)}&hook=${encodeURIComponent(sotd.hook)}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500/20 text-teal-400 rounded-lg text-xs font-medium hover:bg-teal-500/30 transition-colors min-h-[36px]"
                  >
                    <Sparkles className="w-3 h-3" /> Film This
                  </Link>
                  <Link
                    href="/admin/script-of-the-day"
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    More picks &rarr;
                  </Link>
                </div>
              </div>
              {sotdRunnerUp && (
                <div className="sm:w-48 bg-zinc-800/30 rounded-lg p-3 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Runner Up</span>
                    <p className="text-white text-xs font-medium mt-1 leading-snug line-clamp-2">&ldquo;{sotdRunnerUp.hook}&rdquo;</p>
                    <p className="text-[11px] text-zinc-500 mt-1">{sotdRunnerUp.product_name}</p>
                  </div>
                  <span className="text-[10px] text-zinc-600 mt-2">{getContentTypeName(sotdRunnerUp.content_type)} &middot; Score {sotdRunnerUp.score}/9</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-zinc-600" />
              <h2 className="text-sm font-semibold text-white">Script of the Day</h2>
            </div>
            <div className="text-center py-4">
              <p className="text-sm text-zinc-500 mb-3">Generate today&apos;s content package to see top picks</p>
              <Link
                href="/admin/content-package"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-500/20 text-teal-400 rounded-lg text-sm font-medium hover:bg-teal-500/30 transition-colors"
              >
                <Package className="w-4 h-4" /> Generate Package
              </Link>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-all min-h-[44px] active:scale-[0.98]"
              >
                <div className={`w-9 h-9 rounded-lg ${action.color} flex items-center justify-center mb-2`}>
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <h3 className="font-medium text-sm text-white group-hover:text-teal-400 transition-colors">
                  {action.label}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5 hidden sm:block">{action.description}</p>
              </Link>
            );
          })}
        </div>

        {/* AI Recommendations */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-white">AI Recommendations</h2>
            </div>
            <button
              onClick={fetchRecommendations}
              disabled={recsLoading}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-teal-400 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${recsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {recsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/50">
                  <Skeleton width={36} height={36} />
                  <div className="flex-1">
                    <Skeleton height={14} width="70%" className="mb-1" />
                    <Skeleton height={12} width="90%" />
                  </div>
                </div>
              ))}
            </div>
          ) : recommendations.length > 0 ? (
            <div className="space-y-2">
              {recommendations.slice(0, 3).map((rec) => {
                const studioUrl = `/admin/content-studio?${new URLSearchParams(rec.studio_params).toString()}`;
                const typeColors: Record<string, string> = {
                  underserved_product: 'bg-red-500/20 text-red-400',
                  winner_remix: 'bg-amber-500/20 text-amber-400',
                  trending_hook: 'bg-blue-500/20 text-blue-400',
                  gap_fill: 'bg-purple-500/20 text-purple-400',
                  content_type_diversify: 'bg-teal-500/20 text-teal-400',
                };
                const typeIcons: Record<string, typeof Sparkles> = {
                  underserved_product: AlertTriangle,
                  winner_remix: Trophy,
                  trending_hook: TrendingUp,
                  gap_fill: Calendar,
                  content_type_diversify: Zap,
                };
                const Icon = typeIcons[rec.type] || Lightbulb;
                const colorClass = typeColors[rec.type] || 'bg-zinc-700/50 text-zinc-400';

                return (
                  <div key={rec.id} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/40 hover:bg-zinc-800/70 transition-colors">
                    <div className={`w-9 h-9 rounded-lg ${colorClass} flex items-center justify-center shrink-0`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium leading-snug">{rec.title}</p>
                      <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{rec.description}</p>
                    </div>
                    <Link
                      href={studioUrl}
                      className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-teal-500/20 text-teal-400 rounded-lg text-xs font-medium hover:bg-teal-500/30 transition-colors min-h-[36px]"
                    >
                      <Sparkles className="w-3 h-3" />
                      Generate
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6">
              <Lightbulb className="w-6 h-6 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">Add products and winners to get AI recommendations</p>
            </div>
          )}
        </div>

        {/* Pipeline Health + Calendar Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Pipeline Health */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">Pipeline Health</h2>
              <Link href="/admin/pipeline" className="text-xs text-teal-400 hover:text-teal-300">
                View pipeline
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} height={20} width="100%" />
                ))}
              </div>
            ) : (
              <>
                {/* Status bars */}
                <div className="space-y-2.5">
                  {activeStatuses.map((status) => {
                    const count = data?.pipelineByStatus[status] || 0;
                    const pct = totalActive > 0 ? (count / totalActive) * 100 : 0;
                    return (
                      <div key={status} className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400 w-20 shrink-0">
                          {STATUS_LABELS[status] || status}
                        </span>
                        <div className="flex-1 h-5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${STATUS_COLORS[status] || 'bg-zinc-600'} rounded-full transition-all duration-500`}
                            style={{ width: `${Math.max(pct, count > 0 ? 8 : 0)}%` }}
                          />
                        </div>
                        <span className="text-xs text-zinc-300 w-6 text-right font-medium">{count}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Bottleneck warning */}
                {data?.bottleneck && (
                  <div className="mt-4 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-xs text-amber-300">
                      Bottleneck at <strong>{STATUS_LABELS[data.bottleneck] || data.bottleneck}</strong> — {data.pipelineByStatus[data.bottleneck]} videos stuck
                    </span>
                  </div>
                )}

                {/* Stats row */}
                <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {data?.avgDaysInPipeline || 0}d avg cycle
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" /> {data?.totalVideos || 0} total videos
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Week Calendar Preview */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">This Week</h2>
              <Link href="/admin/calendar" className="text-xs text-teal-400 hover:text-teal-300">
                Full calendar
              </Link>
            </div>

            {loading ? (
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} height={72} width="100%" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1.5">
                {data?.weekCalendar.map((day) => (
                  <div
                    key={day.date}
                    className={`flex flex-col items-center rounded-lg p-2 transition-colors ${
                      day.isToday
                        ? 'bg-teal-500/15 border border-teal-500/30'
                        : 'bg-zinc-800/50 border border-transparent'
                    }`}
                  >
                    <span className={`text-[10px] font-medium ${day.isToday ? 'text-teal-400' : 'text-zinc-500'}`}>
                      {day.dayName}
                    </span>
                    <span className={`text-lg font-bold mt-0.5 ${day.isToday ? 'text-white' : 'text-zinc-300'}`}>
                      {day.dayNum}
                    </span>
                    <div className="flex items-center gap-1 mt-1.5">
                      {day.posted > 0 && (
                        <div className="flex items-center gap-0.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span className="text-[9px] text-emerald-400">{day.posted}</span>
                        </div>
                      )}
                      {day.scheduled > 0 && (
                        <div className="flex items-center gap-0.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                          <span className="text-[9px] text-teal-400">{day.scheduled}</span>
                        </div>
                      )}
                      {day.posted === 0 && day.scheduled === 0 && (
                        <span className="text-[9px] text-zinc-600">-</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Legend */}
            <div className="mt-3 flex items-center gap-4 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Posted
              </span>
              <span className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-400" /> Scheduled
              </span>
            </div>
          </div>
        </div>

        {/* Weekly Activity Chart */}
        {weeklyData.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-400" />
                <h2 className="text-sm font-semibold text-white">This Week&apos;s Activity</h2>
              </div>
              <Link href="/admin/analytics" className="text-xs text-teal-400 hover:text-teal-300">
                Full analytics
              </Link>
            </div>
            <div className="h-48">
              <WeeklyChart data={weeklyData} />
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Recent Activity</h2>
            <Link href="/admin/notifications" className="text-xs text-teal-400 hover:text-teal-300">
              All notifications
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton width={32} height={32} variant="circular" />
                  <div className="flex-1">
                    <Skeleton height={14} width="70%" className="mb-1" />
                    <Skeleton height={12} width="40%" />
                  </div>
                </div>
              ))}
            </div>
          ) : data?.recentActivity && data.recentActivity.length > 0 ? (
            <div className="space-y-1">
              {data.recentActivity.map((item) => {
                const Icon = getActivityIcon(item.type);
                return (
                  <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{item.title}</p>
                      {item.message && (
                        <p className="text-xs text-zinc-500 truncate">{item.message}</p>
                      )}
                    </div>
                    <span className="text-[11px] text-zinc-600 shrink-0">{formatTimeAgo(item.created_at)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">No recent activity</p>
              <Link href="/admin/content-studio" className="text-sm text-teal-400 hover:text-teal-300 mt-2 inline-block">
                Get started by generating a script
              </Link>
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}
