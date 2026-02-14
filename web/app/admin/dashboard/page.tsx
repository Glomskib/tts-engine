'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Video, Upload, Calendar, Bell, Sparkles,
  ArrowRight, TrendingUp, TrendingDown, Activity,
  AlertTriangle, Clock, Eye, FileText, Users, Trophy,
  CheckCircle, Lightbulb, RefreshCw, Zap, Star, Plus,
  ChevronRight, ChevronDown, ChevronUp, Package, Loader2,
  Copy, User, Camera, MessageSquare
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/Skeleton';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { PageErrorState } from '@/components/ui/PageErrorState';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { CONTENT_TYPES } from '@/lib/content-types';
import { BRAND } from '@/lib/brand';

const WeeklyChart = dynamic(() => import('./WeeklyChart'), { ssr: false });
const SetupChecklist = dynamic(() => import('./SetupChecklist'), { ssr: false });
const QuickStart = dynamic(() => import('@/components/dashboard/QuickStart'), { ssr: false });
const OnboardingWizard = dynamic(() => import('@/components/onboarding/OnboardingWizard'), { ssr: false });
const RetainerTracker = dynamic(() => import('./RetainerTracker'), { ssr: false });

function getContentTypeName(id: string): string {
  const ct = CONTENT_TYPES.find(c => c.id === id);
  return ct?.name || id;
}

interface FullScript {
  hook: string;
  setup: string;
  body: string;
  cta: string;
  on_screen_text: string[];
  filming_notes: string;
  persona: string;
  sales_approach: string;
  estimated_length: string;
}

interface SOTDItem {
  id: string;
  product_id: string;
  product_name: string;
  product_brand?: string;
  brand: string;
  content_type: string;
  hook: string;
  script_body: string;
  full_script?: FullScript | null;
  score: number;
  added_to_pipeline: boolean;
  status?: string;
  script_date?: string;
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
  readyForReview: number;
  approvedToday: number;
  videosCreatedToday: number;
  recordingPipelineByStatus: Record<string, number>;
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
    label: 'Production Board',
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
    label: 'Content Planner',
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

const REC_PIPELINE_STATUSES = [
  'NEEDS_SCRIPT', 'GENERATING_SCRIPT', 'NOT_RECORDED', 'AI_RENDERING',
  'READY_FOR_REVIEW', 'RECORDED', 'EDITED', 'READY_TO_POST',
];

const REC_STATUS_LABELS: Record<string, string> = {
  NEEDS_SCRIPT: 'Needs Script',
  GENERATING_SCRIPT: 'Generating',
  NOT_RECORDED: 'Scripted',
  AI_RENDERING: 'AI Rendering',
  READY_FOR_REVIEW: 'Review',
  RECORDED: 'Recorded',
  EDITED: 'Edited',
  READY_TO_POST: 'Approved',
};

const REC_STATUS_COLORS: Record<string, string> = {
  NEEDS_SCRIPT: 'bg-orange-500',
  GENERATING_SCRIPT: 'bg-violet-500',
  NOT_RECORDED: 'bg-zinc-500',
  AI_RENDERING: 'bg-purple-500',
  READY_FOR_REVIEW: 'bg-emerald-500',
  RECORDED: 'bg-blue-500',
  EDITED: 'bg-amber-500',
  READY_TO_POST: 'bg-green-500',
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

function EmailVerificationBanner() {
  const { emailConfirmed, user } = useAuth();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  if (emailConfirmed) return null;

  const handleResend = async () => {
    if (!user?.email) return;
    setResending(true);
    try {
      const { createBrowserSupabaseClient } = await import('@/lib/supabase/client');
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.resend({
        type: 'signup',
        email: user.email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      setResent(true);
    } catch {
      // Silently fail
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-amber-300">
          Please verify your email address to get the most out of {BRAND.name}.
        </p>
      </div>
      {resent ? (
        <span className="text-xs text-emerald-400 font-medium shrink-0">Sent!</span>
      ) : (
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="text-xs text-amber-300 hover:text-amber-200 font-medium underline shrink-0 disabled:opacity-50"
        >
          {resending ? 'Sending...' : 'Resend verification email'}
        </button>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { showSuccess, showError } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(true);
  const [sotd, setSotd] = useState<SOTDItem | null>(null);
  const [sotdRunnerUp, setSotdRunnerUp] = useState<SOTDItem | null>(null);
  const [sotdLoading, setSotdLoading] = useState(true);
  const [addingToPipeline, setAddingToPipeline] = useState(false);
  const [weeklyData, setWeeklyData] = useState<Array<{ day: string; scripts: number; posted: number }>>([]);
  const [sotdExpanded, setSotdExpanded] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [sotdGenerating, setSotdGenerating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/dashboard/stats');
      if (response.ok) {
        const json = await response.json();
        setData(json.data || json);
      } else {
        const json = await response.json().catch(() => ({}));
        setError(json.error || 'Failed to load dashboard data');
      }
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
      setError('Failed to load dashboard data');
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
      const response = await fetch('/api/script-of-the-day');
      if (response.ok) {
        const json = await response.json();
        const item = json.data;
        if (item) {
          // Map SOTD record to SOTDItem shape for the card
          const fullScript = typeof item.full_script === 'string'
            ? JSON.parse(item.full_script)
            : item.full_script;
          setSotd({
            id: item.id,
            product_id: item.product_id,
            product_name: item.product_name,
            product_brand: item.product_brand,
            brand: item.product_brand || '',
            content_type: '',
            hook: item.hook,
            script_body: '',
            full_script: fullScript,
            score: item.compound_score || 0,
            added_to_pipeline: item.status === 'accepted' || item.status === 'filmed',
            status: item.status,
            script_date: item.script_date,
          });
          setSotdRunnerUp(null);
        } else {
          setSotd(null);
          setSotdRunnerUp(null);
        }
      }
    } catch (error) {
      console.error('Failed to fetch SOTD:', error);
    } finally {
      setSotdLoading(false);
    }
  }, []);

  const handleGenerateAnother = useCallback(async () => {
    setSotdGenerating(true);
    try {
      const res = await fetch('/api/script-of-the-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        showSuccess('New script generated!');
        await fetchSOTD();
      } else {
        const json = await res.json().catch(() => ({}));
        showError(json.message || 'Failed to generate');
      }
    } catch {
      showError('Failed to generate script');
    } finally {
      setSotdGenerating(false);
    }
  }, [fetchSOTD, showSuccess, showError]);

  const handleSkipSOTD = useCallback(async () => {
    if (!sotd) return;
    try {
      await fetch('/api/script-of-the-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_status', id: sotd.id, status: 'rejected' }),
      });
      setSotd(null);
    } catch { /* silent */ }
  }, [sotd]);

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

  // Onboarding modal state — check server first, localStorage fallback
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  useEffect(() => {
    // Quick localStorage check first
    if (localStorage.getItem('ff-onboarding-dismissed') === 'true') return;

    // Then check server
    fetch('/api/onboarding/status')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && !data.dismissed && !data.onboarding_complete) {
          setShowOnboardingModal(true);
        }
      })
      .catch(() => {
        // Fallback: show modal for new users if localStorage not set
        if (isNewUser) setShowOnboardingModal(true);
      });
  }, [isNewUser]);

  // Copy script to clipboard
  const handleCopyScript = useCallback((script: FullScript) => {
    const text = `${script.hook}\n\n${script.setup}\n\n${script.body}\n\n${script.cta}`;
    navigator.clipboard.writeText(text).then(() => {
      setScriptCopied(true);
      showSuccess('Script copied to clipboard!');
      setTimeout(() => setScriptCopied(false), 2000);
    }).catch(() => {
      showError('Failed to copy script');
    });
  }, [showSuccess, showError]);

  if (error && !loading) {
    return (
      <PullToRefresh onRefresh={fetchData}>
        <div className="pt-6 pb-24 lg:pb-8 max-w-7xl mx-auto">
          <PageErrorState message={error} onRetry={fetchData} />
        </div>
      </PullToRefresh>
    );
  }

  return (
    <PullToRefresh onRefresh={fetchData}>
      <div className="pt-6 pb-24 lg:pb-8 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-zinc-400 text-sm">Your content operations at a glance</p>
        </div>

        {/* Email verification reminder */}
        <EmailVerificationBanner />

        {/* Quick Start checklist — onboarding for new users */}
        <QuickStart />

        {/* Retainer Tracker — top of page, money on the line */}
        <RetainerTracker />

        {/* Morning Briefing */}
        {!loading && data && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Videos Created Today */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 min-h-[88px]">
              <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                <Video className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] sm:text-xs leading-tight">Videos Today</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-white">{data.videosCreatedToday}</div>
              <div className="text-[11px] sm:text-xs text-zinc-500 mt-0.5">created today</div>
            </div>

            {/* Ready for Review — prominent with link */}
            <Link href="/admin/review" className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 min-h-[88px] hover:border-emerald-500/50 transition-colors group">
              <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
                <Eye className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] sm:text-xs font-medium leading-tight">Ready for Review</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-white">{data.readyForReview}</div>
              <div className="text-[11px] sm:text-xs text-emerald-400 mt-0.5 flex items-center gap-1 group-hover:underline">
                Review now <ArrowRight className="w-3 h-3" />
              </div>
            </Link>

            {/* Approved Today */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 min-h-[88px]">
              <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] sm:text-xs leading-tight">Approved Today</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-white">{data.approvedToday}</div>
              <div className="text-[11px] sm:text-xs text-zinc-500 mt-0.5">moved to posting</div>
            </div>

            {/* Weekly Output */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 min-h-[88px]">
              <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] sm:text-xs leading-tight">Posted This Week</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-white">{data.postedThisWeek}</div>
              <div className="flex items-center gap-1 text-[11px] sm:text-xs mt-0.5">
                {(data.postedTrend || 0) >= 0 ? (
                  <span className="text-green-400">+{data.postedTrend || 0}%</span>
                ) : (
                  <span className="text-red-400">{data.postedTrend}%</span>
                )}
                <span className="text-zinc-500">vs last wk</span>
              </div>
            </div>
          </div>
        )}

        {/* Recording Pipeline Status */}
        {!loading && data && (() => {
          const recTotal = REC_PIPELINE_STATUSES.reduce((sum, s) => sum + (data.recordingPipelineByStatus[s] || 0), 0);
          return recTotal > 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-teal-400" />
                  <h2 className="text-sm font-semibold text-white">Recording Pipeline</h2>
                  <span className="text-xs text-zinc-500">{recTotal} active</span>
                </div>
                <Link href="/admin/pipeline" className="text-xs text-teal-400 hover:text-teal-300">
                  Open board
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {REC_PIPELINE_STATUSES.map((status) => {
                  const count = data.recordingPipelineByStatus[status] || 0;
                  const isReview = status === 'READY_FOR_REVIEW';
                  return (
                    <div
                      key={status}
                      className={`text-center p-1.5 sm:p-2 rounded-lg ${
                        isReview && count > 0
                          ? 'bg-emerald-500/15 border border-emerald-500/30'
                          : 'bg-zinc-800/50'
                      }`}
                    >
                      <div className={`text-base sm:text-lg font-bold ${count > 0 ? 'text-white' : 'text-zinc-600'}`}>
                        {count}
                      </div>
                      <div className={`text-[9px] sm:text-[10px] leading-tight ${isReview && count > 0 ? 'text-emerald-400 font-medium' : 'text-zinc-500'}`}>
                        {REC_STATUS_LABELS[status]}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null;
        })()}

        {/* Setup Checklist — shown until all steps done or user dismisses */}
        {!loading && data && (
          <SetupChecklist
            scriptsCount={data.scriptsCount || 0}
            totalVideos={data.totalVideos || 0}
          />
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 min-h-[88px]">
                <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] sm:text-xs leading-tight">Posted This Week</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold text-white">{data?.postedThisWeek || 0}</div>
                <div className="flex items-center gap-1 text-[11px] sm:text-xs mt-0.5">
                  {(data?.postedTrend || 0) >= 0 ? (
                    <><TrendingUp className="w-3 h-3 text-green-400 shrink-0" /><span className="text-green-400">+{data?.postedTrend || 0}%</span></>
                  ) : (
                    <><TrendingDown className="w-3 h-3 text-red-400 shrink-0" /><span className="text-red-400">{data?.postedTrend}%</span></>
                  )}
                  <span className="text-zinc-500">vs last wk</span>
                </div>
              </div>

              {/* In Pipeline */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 min-h-[88px]">
                <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                  <Video className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] sm:text-xs leading-tight">In Pipeline</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold text-white">{data?.inPipeline || 0}</div>
                <div className="text-[11px] sm:text-xs text-zinc-500 mt-0.5">
                  {data?.avgDaysInPipeline || 0}d avg cycle
                </div>
              </div>

              {/* VA Queue */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 min-h-[88px]">
                <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] sm:text-xs leading-tight">VA Queue</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold text-white">{data?.vaQueue || 0}</div>
                <div className="text-[11px] sm:text-xs text-zinc-500 mt-0.5">assigned videos</div>
              </div>

              {/* Library Stats */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 min-h-[88px]">
                <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] sm:text-xs leading-tight">Content Library</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold text-white">{data?.scriptsCount || 0}</div>
                <div className="flex items-center gap-1 text-[11px] sm:text-xs mt-0.5">
                  <Trophy className="w-3 h-3 text-amber-400 shrink-0" />
                  <span className="text-zinc-500">{data?.winnersCount || 0} winners</span>
                </div>
              </div>

              {/* Unread Alerts */}
              <Link href="/admin/notifications" className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 min-h-[88px] hover:border-zinc-700 transition-colors col-span-2 lg:col-span-1">
                <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                  <Bell className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] sm:text-xs leading-tight">Unread Alerts</span>
                </div>
                <div className={`text-xl sm:text-2xl font-bold ${(data?.unreadAlerts || 0) > 0 ? 'text-red-400' : 'text-white'}`}>
                  {data?.unreadAlerts || 0}
                </div>
                <div className="text-[11px] sm:text-xs text-teal-400 mt-0.5 flex items-center gap-1">
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
          <div className="bg-gradient-to-r from-amber-500/5 via-zinc-900 to-zinc-900 border border-amber-500/20 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="p-5 pb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-semibold text-white">Script of the Day</h2>
                </div>
                <Link href="/admin/script-of-the-day" className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1">
                  See all <ChevronRight className="w-3 h-3" />
                </Link>
              </div>

              {/* Product Info */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-base font-bold text-white">{sotd.product_name}</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">{sotd.brand}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs font-medium bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">
                      Score {Math.min(Math.round(sotd.score ?? 0), 10)}/10
                    </span>
                    <span className="text-xs text-zinc-500">{getContentTypeName(sotd.content_type)}</span>
                    {sotd.full_script?.persona && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-violet-500/15 text-violet-300 border border-violet-500/20">
                        <User className="w-3 h-3 inline mr-1" />{sotd.full_script.persona}
                      </span>
                    )}
                    {sotd.full_script?.sales_approach && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/15 text-blue-300 border border-blue-500/20">
                        {sotd.full_script.sales_approach}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Full Script or Hook */}
              {sotd.full_script ? (
                <div className="space-y-2">
                  {/* Hook */}
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                    <span className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold block mb-1">
                      Hook — First 3 Seconds
                    </span>
                    <p className="text-sm font-bold leading-snug text-white">
                      &quot;{sotd.full_script.hook}&quot;
                    </p>
                  </div>

                  {/* Script body preview (collapsed) */}
                  {!sotdExpanded && sotd.full_script.setup && (
                    <div className="bg-zinc-800/50 rounded-lg p-3">
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold block mb-1">
                        Script Preview
                      </span>
                      <p className="text-xs text-zinc-300 leading-relaxed line-clamp-3 whitespace-pre-line">
                        {sotd.full_script.setup}
                        {sotd.full_script.body ? `\n${sotd.full_script.body}` : ''}
                      </p>
                    </div>
                  )}

                  {/* Expandable Full Script */}
                  {sotdExpanded && (
                    <>
                      {/* Setup */}
                      <div className="bg-zinc-800 rounded-lg p-3">
                        <span className="text-[10px] uppercase tracking-wider text-teal-400 font-semibold block mb-1">
                          Setup — The Context
                        </span>
                        <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-line">
                          {sotd.full_script.setup}
                        </p>
                      </div>

                      {/* Body */}
                      <div className="bg-zinc-800 rounded-lg p-3">
                        <span className="text-[10px] uppercase tracking-wider text-blue-400 font-semibold block mb-1">
                          Body — The Pitch
                        </span>
                        <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-line">
                          {sotd.full_script.body}
                        </p>
                      </div>

                      {/* CTA */}
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                        <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold block mb-1">
                          Call to Action
                        </span>
                        <p className="text-xs text-zinc-200 leading-relaxed">
                          {sotd.full_script.cta}
                        </p>
                      </div>

                      {/* On-Screen Text + Filming Notes */}
                      <div className="grid md:grid-cols-2 gap-2">
                        {sotd.full_script.on_screen_text?.length > 0 && (
                          <div className="bg-zinc-800/60 rounded-lg p-3">
                            <span className="text-[10px] uppercase tracking-wider text-violet-400 font-semibold block mb-2">
                              <MessageSquare className="w-3 h-3 inline mr-1" /> On-Screen Text
                            </span>
                            <ul className="space-y-1">
                              {sotd.full_script.on_screen_text.map((text, i) => (
                                <li key={i} className="text-xs text-zinc-300 flex items-start gap-2">
                                  <span className="text-violet-400/60 mt-0.5">&#x2022;</span>
                                  {text}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {sotd.full_script.filming_notes && (
                          <div className="bg-zinc-800/60 rounded-lg p-3">
                            <span className="text-[10px] uppercase tracking-wider text-orange-400 font-semibold block mb-2">
                              <Camera className="w-3 h-3 inline mr-1" /> Filming Notes
                            </span>
                            <p className="text-xs text-zinc-300 leading-relaxed">
                              {sotd.full_script.filming_notes}
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Expand/Collapse + Actions */}
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <button
                      onClick={() => setSotdExpanded(!sotdExpanded)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors"
                    >
                      {sotdExpanded ? (
                        <><ChevronUp className="w-3 h-3" /> Collapse</>
                      ) : (
                        <><ChevronDown className="w-3 h-3" /> View Full Script</>
                      )}
                    </button>
                    <button
                      onClick={() => handleCopyScript(sotd.full_script!)}
                      disabled={scriptCopied}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {scriptCopied ? (
                        <><CheckCircle className="w-3 h-3" /> Copied!</>
                      ) : (
                        <><Copy className="w-3 h-3" /> Copy Script</>
                      )}
                    </button>
                    <Link
                      href={`/admin/content-studio?product=${sotd.product_id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500/20 text-teal-400 rounded-lg text-xs font-medium hover:bg-teal-500/30 transition-colors"
                    >
                      <Sparkles className="w-3 h-3" /> Use This Script
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  {/* Fallback: Hook only */}
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-3">
                    <span className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold block mb-1">
                      Hook
                    </span>
                    <p className="text-white font-medium text-sm leading-snug">&ldquo;{sotd.hook}&rdquo;</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/admin/content-studio?product=${sotd.product_id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500/20 text-teal-400 rounded-lg text-xs font-medium hover:bg-teal-500/30 transition-colors"
                    >
                      <Sparkles className="w-3 h-3" /> Use This Script
                    </Link>
                    <button
                      onClick={handleGenerateAnother}
                      disabled={sotdGenerating}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {sotdGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      {sotdGenerating ? 'Generating...' : 'Generate Another'}
                    </button>
                    <button
                      onClick={handleSkipSOTD}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-zinc-500 hover:text-zinc-400 rounded-lg text-xs font-medium transition-colors"
                    >
                      Skip Today
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Runner-Up (if exists) */}
            {sotdRunnerUp && (
              <div className="bg-zinc-800/30 border-t border-zinc-800 px-5 py-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Runner Up</span>
                    <p className="text-white text-xs font-medium mt-1 leading-snug">&ldquo;{sotdRunnerUp.full_script?.hook || sotdRunnerUp.hook}&rdquo;</p>
                    <p className="text-[11px] text-zinc-500 mt-1">{sotdRunnerUp.product_name} · {sotdRunnerUp.brand}</p>
                  </div>
                  <Link
                    href="/admin/script-of-the-day"
                    className="text-xs text-teal-400 hover:text-teal-300 whitespace-nowrap ml-3"
                  >
                    View all →
                  </Link>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-zinc-600" />
              <h2 className="text-sm font-semibold text-white">Script of the Day</h2>
            </div>
            <div className="text-center py-4">
              <p className="text-sm text-zinc-500 mb-3">No script yet today — generate one now</p>
              <button
                onClick={handleGenerateAnother}
                disabled={sotdGenerating}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-500/20 text-teal-400 rounded-lg text-sm font-medium hover:bg-teal-500/30 transition-colors disabled:opacity-50"
              >
                {sotdGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {sotdGenerating ? 'Generating...' : 'Generate Script'}
              </button>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
              <div className="grid grid-cols-7 gap-2 overflow-x-auto pb-1">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} height={72} width="100%" className="min-w-[48px]" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {data?.weekCalendar.map((day) => (
                  <div
                    key={day.date}
                    className={`flex flex-col items-center rounded-lg p-1 sm:p-2 min-w-0 transition-colors ${
                      day.isToday
                        ? 'bg-teal-500/15 border border-teal-500/30'
                        : 'bg-zinc-800/50 border border-transparent'
                    }`}
                  >
                    <span className={`text-[9px] sm:text-[10px] font-medium ${day.isToday ? 'text-teal-400' : 'text-zinc-500'}`}>
                      {day.dayName}
                    </span>
                    <span className={`text-base sm:text-lg font-bold mt-0.5 ${day.isToday ? 'text-white' : 'text-zinc-300'}`}>
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

      {/* Onboarding wizard for first-time users */}
      {showOnboardingModal && (
        <OnboardingWizard onComplete={() => setShowOnboardingModal(false)} />
      )}
    </PullToRefresh>
  );
}
