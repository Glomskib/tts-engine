'use client';

/**
 * /home — Creator dashboard. The actual landing surface for signed-in users.
 *
 * 2026-06-01 redesign: the original /home was mostly an 8-card launcher.
 * Top-nav unification is moving those launchers into the global nav, so
 * this page now leads with the signal modules that matter daily for a
 * creator: today's schedule, posting streak, last win, recent renders,
 * and quota. Quick actions stay at the bottom as a thin row of secondary
 * buttons.
 *
 * Data fans out from two endpoints to keep things snappy:
 *   - /api/credits             (plan/credit/quota — unchanged)
 *   - /api/home/dashboard      (today's posts + streak + last win + renders)
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Sparkles, Camera, Users, Film, ArrowRight, Loader2, Crown, Zap, Plus,
  Flame, Trophy, Calendar as CalendarIcon, Clock, CheckCircle2, XCircle, AlertCircle,
  ChevronRight, Image as ImageIcon, Play,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { QueueStatusBanner } from '@/components/queue/QueueStatusBanner';

interface CreditsResponse {
  ok?: boolean;
  credits?: {
    remaining: number;
    isUnlimited: boolean;
    usedThisPeriod?: number;
  };
  subscription?: {
    planId: string;
    planName: string;
    creditsPerMonth: number;
    isUnlimited: boolean;
    currentPeriodEnd: string | null;
  };
}

interface TodaysPost {
  id: string;
  scheduled_at: string;
  status: string;
  avatar_id: string | null;
  avatar_name: string | null;
  avatar_thumb: string | null;
  content_item_id: string | null;
  content_item_status: string | null;
  hook: string | null;
}

interface LastWin {
  id: string;
  title: string;
  hook: string | null;
  thumb_url: string | null;
  platform: string | null;
  posted_at: string | null;
}

interface RecentRender {
  id: string;
  title: string;
  status: string;
  pill: 'Rendering' | 'Ready' | 'Posted' | 'Failed';
  thumb_url: string | null;
  created_at: string;
  posted_at: string | null;
}

interface DashboardResponse {
  ok?: boolean;
  data?: {
    todays_posts: TodaysPost[];
    streak_days: number;
    last_win: LastWin | null;
    recent_renders: RecentRender[];
    avatar_count?: number;
  };
}

/** Format an ISO timestamp as "Xh ago" / "Xm ago" / "Xd ago". */
function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Format an ISO timestamp as e.g. "8:00 AM" in the user's locale. */
function timeOfDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function HomeDashboard() {
  const { authenticated, loading: authLoading, user } = useAuth();
  const [creditsData, setCreditsData] = useState<CreditsResponse | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [dash, setDash] = useState<DashboardResponse['data'] | null>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [skipping, setSkipping] = useState<string | null>(null);

  const loadCredits = useCallback(async () => {
    try {
      const r = await fetch('/api/credits', { credentials: 'include', cache: 'no-store' });
      if (r.ok) {
        const j = (await r.json()) as CreditsResponse;
        setCreditsData(j);
      }
    } catch {
      // silent — banner will show "—"
    } finally {
      setCreditsLoading(false);
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const r = await fetch('/api/home/dashboard', { credentials: 'include', cache: 'no-store' });
      if (r.ok) {
        const j = (await r.json()) as DashboardResponse;
        setDash(j.data || null);
      }
    } catch {
      // silent — empty modules will render their fallbacks
    } finally {
      setDashLoading(false);
    }
  }, []);

  // 2026-06-09: first-time-user redirect. Brand-new customers who just verified
  // their email land on /home, which shows empty modules and "Make your first
  // video" — but the actual first step they need is to MAKE AN AVATAR (Quick
  // Video needs an avatar to film with). Send them to /avatars/new on first
  // visit if they have zero avatars + zero renders. We check the dashboard
  // payload AFTER it loads (avoids a flash of the empty home), and we only
  // redirect ONCE per session (sessionStorage flag) so they can still navigate
  // back to /home manually if they want.
  useEffect(() => {
    if (!dash || dashLoading || authLoading || !authenticated) return;
    if (typeof window === 'undefined') return;
    const alreadyRedirected = sessionStorage.getItem('ff_first_render_redirect_done');
    if (alreadyRedirected) return;
    const avatarCount = dash.avatar_count ?? 0;
    const recentRenders = dash.recent_renders?.length ?? 0;
    const todaysPosts = dash.todays_posts?.length ?? 0;
    // Truly first-time = no avatars, no renders, no scheduled posts. Sending
    // them straight to /avatars/new gets them to value 4x faster.
    if (avatarCount === 0 && recentRenders === 0 && todaysPosts === 0) {
      sessionStorage.setItem('ff_first_render_redirect_done', '1');
      window.location.href = '/avatars/new?onboarding=1';
    }
  }, [dash, dashLoading, authLoading, authenticated]);

  useEffect(() => {
    if (authenticated) {
      loadCredits();
      loadDashboard();
    } else if (!authLoading) {
      setCreditsLoading(false);
      setDashLoading(false);
    }
  }, [authenticated, authLoading, loadCredits, loadDashboard]);

  // Anon visitors get punted to /login. Marketing landing lives at /.
  if (!authLoading && !authenticated) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login?next=/home';
    }
    return null;
  }

  const planName = creditsData?.subscription?.planName ?? 'Free';
  const isUnlimited = creditsData?.credits?.isUnlimited ?? creditsData?.subscription?.isUnlimited ?? false;
  const remaining = creditsData?.credits?.remaining ?? 0;
  const usedThisPeriod = creditsData?.credits?.usedThisPeriod ?? 0;
  const creditsForMonth = creditsData?.subscription?.creditsPerMonth ?? 0;

  // Greet by first name when we have it, else fallback to email handle.
  const greetingName = (() => {
    if (!user?.email) return 'there';
    const handle = user.email.split('@')[0];
    return handle.charAt(0).toUpperCase() + handle.slice(1);
  })();

  const todaysPosts = dash?.todays_posts ?? [];
  const streakDays = dash?.streak_days ?? 0;
  const lastWin = dash?.last_win ?? null;
  const recentRenders = dash?.recent_renders ?? [];

  /** Skip a scheduled post for today by routing through the existing
   *  per-avatar override DELETE endpoint. Optimistically removes the tile. */
  const handleSkip = async (post: TodaysPost) => {
    if (!post.avatar_id) return;
    setSkipping(post.id);
    try {
      await fetch(`/api/avatars/${post.avatar_id}/schedule/override`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ override_id: post.id }),
      });
      // Optimistic UI — drop the tile regardless of server response.
      setDash((prev) =>
        prev
          ? { ...prev, todays_posts: prev.todays_posts.filter((p) => p.id !== post.id) }
          : prev,
      );
    } catch {
      // Ignore — user can refresh and see actual state.
    } finally {
      setSkipping(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">

        {/* ── Header strip: greeting + plan/credit badge ── */}
        <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap mb-4 sm:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome back, {greetingName}.
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Here's where things stand today.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/account/billing"
              className={`group inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                isUnlimited
                  ? 'bg-gradient-to-r from-amber-500/15 to-orange-500/10 border-amber-500/30 text-amber-200 hover:border-amber-400/50'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:border-zinc-500'
              }`}
            >
              {isUnlimited ? (
                <>
                  <Crown className="w-3.5 h-3.5 text-amber-300" />
                  <span>{planName} · <span className="font-semibold">Unlimited</span></span>
                </>
              ) : creditsLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading…</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-teal-300" />
                  <span>
                    {planName} ·{' '}
                    <span className="font-semibold text-white">{remaining}</span>
                    <span className="text-zinc-500"> credits left</span>
                  </span>
                </>
              )}
              <ArrowRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition" />
            </Link>

            {!isUnlimited && (
              <Link
                href="/pricing"
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-white text-xs font-semibold"
              >
                <Crown className="w-3.5 h-3.5" /> Upgrade
              </Link>
            )}
          </div>
        </div>

        {/* Live queue health banner (reuses existing component) */}
        <QueueStatusBanner />

        {/* Low-credit warning (still here — friendliest place for it) */}
        {!isUnlimited && !creditsLoading && remaining > 0 && remaining <= 5 && (
          <div className="mb-4 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-orange-500/5 px-4 py-3 flex items-center gap-3">
            <Zap className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-amber-100">
                Only <span className="text-white">{remaining}</span> credit{remaining === 1 ? '' : 's'} left this period
              </div>
              <div className="text-[11px] text-amber-200/70">Upgrade before you hit zero — videos render right where you left off.</div>
            </div>
            <Link
              href="/pricing"
              className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-900 text-xs font-semibold"
            >
              Upgrade
            </Link>
          </div>
        )}

        {/* Out-of-credits hard stop */}
        {!isUnlimited && !creditsLoading && remaining === 0 && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 flex items-center gap-3">
            <Zap className="w-5 h-5 text-red-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-red-100">You're out of credits this period</div>
              <div className="text-[11px] text-red-200/70">Upgrade to keep shipping videos today.</div>
            </div>
            <Link
              href="/pricing"
              className="shrink-0 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-400 text-white text-xs font-semibold"
            >
              Upgrade
            </Link>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            MODULE 1 — TODAY'S SCHEDULE (most prominent)
            ───────────────────────────────────────────────────────────── */}
        <section className="mt-6 sm:mt-8 mb-6 sm:mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 inline-flex items-center gap-2">
              <CalendarIcon className="w-3.5 h-3.5" /> Today's schedule
            </h2>
            <Link
              href="/avatars"
              className="text-xs text-teal-400 hover:text-teal-300 inline-flex items-center gap-1"
            >
              Manage <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {dashLoading ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-600 mx-auto" />
            </div>
          ) : todaysPosts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-6 sm:p-8 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                <CalendarIcon className="w-5 h-5 text-zinc-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-zinc-200">Nothing scheduled today.</div>
                <div className="text-xs text-zinc-500">Set up an avatar + a daily slot and we'll post for you on auto-pilot.</div>
              </div>
              <Link
                href="/avatars"
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-white text-xs font-semibold"
              >
                Set up daily posting <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {todaysPosts.slice(0, 6).map((post) => {
                const status = (post.content_item_status || post.status || 'queued').toLowerCase();
                let pill: { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> } = {
                  label: 'Queued',
                  cls: 'bg-zinc-800 text-zinc-300 border-zinc-700',
                  Icon: Clock,
                };
                if (status === 'posted' || status === 'published') {
                  pill = { label: 'Posted', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', Icon: CheckCircle2 };
                } else if (status === 'failed' || status === 'error') {
                  pill = { label: 'Failed', cls: 'bg-red-500/15 text-red-300 border-red-500/30', Icon: XCircle };
                } else if (status === 'posting' || status === 'fired' || status === 'uploading' || status === 'processing') {
                  pill = { label: 'Posting', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', Icon: Loader2 };
                }
                const StatusIcon = pill.Icon;
                const isCancellable = status === 'pending' || status === 'queued';

                return (
                  <div
                    key={post.id}
                    className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3 flex items-center gap-3"
                  >
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 shrink-0">
                      {post.avatar_thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.avatar_thumb} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-700">
                          <Users className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-zinc-100 truncate">
                        {post.avatar_name || 'Avatar'}
                      </div>
                      <div className="text-[11px] text-zinc-500 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {timeOfDay(post.scheduled_at)}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${pill.cls}`}
                        >
                          <StatusIcon className={`w-3 h-3 ${status === 'posting' ? 'animate-spin' : ''}`} /> {pill.label}
                        </span>
                      </div>
                    </div>
                    {isCancellable && (
                      <button
                        type="button"
                        onClick={() => handleSkip(post)}
                        disabled={skipping === post.id}
                        className="shrink-0 text-[11px] text-zinc-400 hover:text-white disabled:opacity-50 px-2 py-1 rounded border border-zinc-800 hover:border-zinc-600"
                      >
                        {skipping === post.id ? '…' : 'Skip'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ─────────────────────────────────────────────────────────────
            MODULE 2 — STREAK + LAST WIN (2-up)
            ───────────────────────────────────────────────────────────── */}
        <section className="mb-6 sm:mb-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Streak tile */}
          <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-orange-500/10 to-red-500/5 p-4 sm:p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shrink-0">
              <Flame className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              {dashLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-zinc-600" />
              ) : streakDays > 0 ? (
                <>
                  <div className="text-2xl sm:text-3xl font-bold tracking-tight">
                    {streakDays} day{streakDays === 1 ? '' : 's'}
                  </div>
                  <div className="text-xs text-zinc-400">posting streak</div>
                </>
              ) : (
                <>
                  <div className="text-sm font-semibold text-zinc-200">Start a streak.</div>
                  <div className="text-xs text-zinc-500">Post today to begin.</div>
                </>
              )}
            </div>
          </div>

          {/* Last win tile */}
          {/* There is no /clips/[id] route — linking there 404'd (2026-06-10
              audit). thumb_url actually carries content_items.final_video_url
              (an MP4), so link straight to the video when we have it; fall
              back to the My Clips list otherwise. */}
          <Link
            href={lastWin?.thumb_url || '/clips'}
            target={lastWin?.thumb_url ? '_blank' : undefined}
            className="group rounded-2xl border border-zinc-800 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 p-4 sm:p-5 flex items-center gap-4 hover:border-emerald-500/30 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 shrink-0 flex items-center justify-center">
              {lastWin?.thumb_url ? (
                // Most of our final_video_url values point at MP4s, not images.
                // We show a Play icon overlay rather than try to embed video.
                <div className="relative w-full h-full bg-zinc-800">
                  <Play className="w-5 h-5 text-white absolute inset-0 m-auto" />
                </div>
              ) : (
                <Trophy className="w-6 h-6 text-emerald-300" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              {dashLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-zinc-600" />
              ) : lastWin ? (
                <>
                  <div className="text-xs uppercase tracking-wider text-emerald-300/80 font-semibold">Last win</div>
                  <div className="text-sm font-semibold text-zinc-100 truncate">
                    {lastWin.hook || lastWin.title}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {lastWin.platform ? `${lastWin.platform} · ` : ''}posted {timeAgo(lastWin.posted_at)}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm font-semibold text-zinc-200">Your first win will show here.</div>
                  <div className="text-xs text-zinc-500">Once you post, this lights up.</div>
                </>
              )}
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-emerald-300 group-hover:translate-x-0.5 transition shrink-0" />
          </Link>
        </section>

        {/* ─────────────────────────────────────────────────────────────
            MODULE 6 — QUOTA PROGRESS (kept; non-unlimited only)
            ───────────────────────────────────────────────────────────── */}
        {!isUnlimited && !creditsLoading && creditsForMonth > 0 && (
          <section className="mb-6 sm:mb-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs text-zinc-400">
                <span className="font-medium text-zinc-200">{planName}</span> · this month
              </div>
              <div className="text-xs font-mono text-zinc-300">
                {usedThisPeriod} / {creditsForMonth} used
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-400 to-emerald-400 transition-all"
                style={{ width: `${Math.min(100, (usedThisPeriod / Math.max(1, creditsForMonth)) * 100)}%` }}
              />
            </div>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1 mt-2 text-[11px] text-teal-400 hover:text-teal-300"
            >
              Need more? <ArrowRight className="w-3 h-3" />
            </Link>
          </section>
        )}

        {/* ─────────────────────────────────────────────────────────────
            MODULE 5 — RECENT RENDERS (last 5 with status pills)
            ───────────────────────────────────────────────────────────── */}
        <section className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 inline-flex items-center gap-2">
              <Film className="w-3.5 h-3.5" /> Recent renders
            </h2>
            <Link
              href="/clips"
              className="text-xs text-teal-400 hover:text-teal-300 inline-flex items-center gap-1"
            >
              See all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {dashLoading ? (
            <div className="text-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-600 mx-auto" />
            </div>
          ) : recentRenders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-8 text-center">
              <Film className="w-6 h-6 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-300 font-medium mb-1">No videos yet</p>
              <p className="text-xs text-zinc-500 mb-5">
                Drop a video into Create or open Studio to capture one.
              </p>
              <Link
                href="/create"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-white text-sm font-semibold"
              >
                <Plus className="w-4 h-4" /> Make your first video
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {recentRenders.map((clip) => {
                const pillCls =
                  clip.pill === 'Posted'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : clip.pill === 'Ready'
                    ? 'bg-teal-500/15 text-teal-300 border-teal-500/30'
                    : clip.pill === 'Failed'
                    ? 'bg-red-500/15 text-red-300 border-red-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30';
                const PillIcon =
                  clip.pill === 'Posted'
                    ? CheckCircle2
                    : clip.pill === 'Ready'
                    ? Play
                    : clip.pill === 'Failed'
                    ? AlertCircle
                    : Loader2;
                return (
                  // No /clips/[id] route exists — the old per-id href 404'd
                  // (2026-06-10 audit). thumb_url is really final_video_url
                  // (the rendered MP4): open it directly when the render is
                  // done, otherwise send them to the My Clips list.
                  <Link
                    key={clip.id}
                    href={clip.thumb_url || '/clips'}
                    target={clip.thumb_url ? '_blank' : undefined}
                    className="group rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900/40 hover:border-zinc-600 transition-colors"
                  >
                    <div className="aspect-[9/16] bg-zinc-950 relative">
                      {clip.thumb_url ? (
                        <div className="relative w-full h-full bg-zinc-800">
                          <Play className="w-7 h-7 text-white/90 absolute inset-0 m-auto" />
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-700">
                          <ImageIcon className="w-6 h-6" />
                        </div>
                      )}
                      <span
                        className={`absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border backdrop-blur ${pillCls}`}
                      >
                        <PillIcon className={`w-3 h-3 ${clip.pill === 'Rendering' ? 'animate-spin' : ''}`} /> {clip.pill}
                      </span>
                    </div>
                    <div className="p-2.5">
                      <div className="text-xs text-zinc-200 truncate font-medium">
                        {clip.title}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* ─────────────────────────────────────────────────────────────
            QUICK ACTIONS — small secondary row (full launcher moved
            into TopNav by the nav-unification agent).
            ───────────────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
            Quick actions
          </h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/create"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 hover:border-zinc-600 text-xs text-zinc-200"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-300" /> Create new clip
            </Link>
            <Link
              href="/avatars"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 hover:border-zinc-600 text-xs text-zinc-200"
            >
              <Users className="w-3.5 h-3.5 text-rose-300" /> Pick an avatar
            </Link>
            <Link
              href="/avatars"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 hover:border-zinc-600 text-xs text-zinc-200"
            >
              <CalendarIcon className="w-3.5 h-3.5 text-sky-300" /> Schedule posts
            </Link>
            <Link
              href="/studio"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 hover:border-zinc-600 text-xs text-zinc-200"
            >
              <Camera className="w-3.5 h-3.5 text-violet-300" /> Open Studio
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
