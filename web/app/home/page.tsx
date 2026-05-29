'use client';

/**
 * /home — Creator dashboard. The actual landing surface for signed-in users.
 *
 * Replaces the previous behaviour of "Open FlashFlow" punting straight to
 * /create. Brandon's feedback (incident 2026-05-27): the home for a logged-in
 * creator should be a dashboard with quick links to favourite tools,
 * contest/quota status, and recent work — not the kitchen-sink /create page.
 *
 * What's on this page:
 *   • Credit balance + plan badge (via /api/credits)
 *   • Live queue health (reuses QueueStatusBanner — surfaces stuck jobs)
 *   • 8 one-click cards: Create, Studio, Avatars, Clips, Today briefing,
 *     Scripts, Comment Bubble, Transcriber
 *   • Quota / contest strip (placeholder where it can't be filled, real
 *     data where it can)
 *   • Recent clips (top 4 from /api/clips list — falls back to a CTA when
 *     empty so brand-new accounts aren't a blank wall)
 *
 * The marketing landing at `/` stays as-is (it's the SEO surface). AuthNav
 * now points authenticated users to `/home` instead of `/create`.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Sparkles, Camera, Users, Film, FileText, MessageSquare, Mic,
  CalendarDays, ArrowRight, Loader2, Crown, Zap, Plus,
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

interface RecentClip {
  id: string;
  title?: string | null;
  status?: string;
  thumb_url?: string | null;
  created_at?: string;
}

interface ClipsResponse {
  ok?: boolean;
  clips?: RecentClip[];
  rows?: RecentClip[];
}

const CARDS: {
  href: string;
  label: string;
  blurb: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent: string;
}[] = [
  {
    href: '/create',
    label: 'Create a clip',
    blurb: 'Upload or paste a link, pick a vibe, render.',
    Icon: Sparkles,
    accent: 'from-teal-500/20 to-emerald-500/10 border-teal-500/30 text-teal-300',
  },
  {
    href: '/studio',
    label: 'Studio',
    blurb: 'Phone-first record-stop-record loop.',
    Icon: Camera,
    accent: 'from-violet-500/20 to-fuchsia-500/10 border-violet-500/30 text-violet-300',
  },
  {
    href: '/avatars',
    label: 'AI Cast',
    blurb: 'Your reusable AI talent — same face, every video.',
    Icon: Users,
    accent: 'from-rose-500/20 to-pink-500/10 border-rose-500/30 text-rose-300',
  },
  {
    href: '/clips',
    label: 'My clips',
    blurb: 'Finished + in-flight clips with re-render.',
    Icon: Film,
    accent: 'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-300',
  },
  {
    href: '/admin/today',
    label: 'Today',
    blurb: 'Your daily briefing — opportunities + signals.',
    Icon: CalendarDays,
    accent: 'from-sky-500/20 to-cyan-500/10 border-sky-500/30 text-sky-300',
  },
  {
    href: '/admin/content-studio',
    label: 'Scripts',
    blurb: 'AI script generator with 20+ personas.',
    Icon: FileText,
    accent: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-300',
  },
  {
    href: '/tools/tok-comment',
    label: 'Comment bubble',
    blurb: 'Transparent on-screen reply PNG.',
    Icon: MessageSquare,
    accent: 'from-blue-500/20 to-indigo-500/10 border-blue-500/30 text-blue-300',
  },
  {
    href: '/transcribe',
    label: 'Transcriber',
    blurb: 'Paste a TikTok or YouTube URL → clean transcript.',
    Icon: Mic,
    accent: 'from-zinc-500/20 to-zinc-700/10 border-zinc-500/30 text-zinc-300',
  },
];

export default function HomeDashboard() {
  const { authenticated, loading: authLoading, user } = useAuth();
  const [creditsData, setCreditsData] = useState<CreditsResponse | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [recentClips, setRecentClips] = useState<RecentClip[]>([]);
  const [clipsLoading, setClipsLoading] = useState(true);

  const loadCredits = useCallback(async () => {
    try {
      const r = await fetch('/api/credits', { credentials: 'include', cache: 'no-store' });
      if (r.ok) {
        const j = await r.json() as CreditsResponse;
        setCreditsData(j);
      }
    } catch {
      // silent — banner will just show "—"
    } finally {
      setCreditsLoading(false);
    }
  }, []);

  const loadClips = useCallback(async () => {
    try {
      const r = await fetch('/api/clips?limit=4', { credentials: 'include', cache: 'no-store' });
      if (r.ok) {
        const j = await r.json() as ClipsResponse;
        setRecentClips((j.clips || j.rows || []).slice(0, 4));
      }
    } catch {
      // silent
    } finally {
      setClipsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      loadCredits();
      loadClips();
    } else if (!authLoading) {
      setCreditsLoading(false);
      setClipsLoading(false);
    }
  }, [authenticated, authLoading, loadCredits, loadClips]);

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

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">

        {/* ── Header strip: greeting + plan/credit badge ── */}
        <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap mb-4 sm:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Hey {greetingName} <span className="inline-block animate-wave">👋</span>
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              What are we shipping today?
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Plan + credits pill */}
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

        {/* ── Live queue health banner (reuses existing component) ── */}
        <QueueStatusBanner />

        {/* ── Quota strip (only meaningful for non-unlimited) ── */}
        {!isUnlimited && !creditsLoading && creditsForMonth > 0 && (
          <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-zinc-400">This month</span>
              <span className="text-xs font-mono text-zinc-300">
                {usedThisPeriod} / {creditsForMonth} used
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-400 to-emerald-400 transition-all"
                style={{ width: `${Math.min(100, (usedThisPeriod / Math.max(1, creditsForMonth)) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* ── Tool cards — 1-click access ── */}
        <section className="mb-8 sm:mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
            Your toolkit
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {CARDS.map(({ href, label, blurb, Icon, accent }) => (
              <Link
                key={href}
                href={href}
                className={`group relative overflow-hidden rounded-xl p-4 bg-gradient-to-br border ${accent} hover:scale-[1.02] transition-transform`}
              >
                <Icon className="w-5 h-5 mb-2.5" />
                <div className="font-semibold text-white text-sm leading-tight">{label}</div>
                <div className="text-[11px] text-zinc-400 mt-1 leading-snug">{blurb}</div>
                <ArrowRight className="w-3.5 h-3.5 absolute top-3 right-3 text-zinc-500 group-hover:text-white group-hover:translate-x-0.5 transition" />
              </Link>
            ))}
          </div>
        </section>

        {/* ── Recent clips ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Recent clips
            </h2>
            <Link
              href="/clips"
              className="text-xs text-teal-400 hover:text-teal-300 inline-flex items-center gap-1"
            >
              See all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {clipsLoading ? (
            <div className="text-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-600 mx-auto" />
            </div>
          ) : recentClips.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 p-8 text-center">
              <Film className="w-6 h-6 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-300 font-medium mb-1">No clips yet</p>
              <p className="text-xs text-zinc-500 mb-5">
                Drop a video into Create or open Studio to capture one.
              </p>
              <Link
                href="/create"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-white text-sm font-semibold"
              >
                <Plus className="w-4 h-4" /> Make your first clip
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {recentClips.map((clip) => (
                <Link
                  key={clip.id}
                  href={`/clips/${clip.id}`}
                  className="group rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900/40 hover:border-zinc-600 transition-colors"
                >
                  <div className="aspect-[9/16] bg-zinc-950 relative">
                    {clip.thumb_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={clip.thumb_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-700">
                        <Film className="w-6 h-6" />
                      </div>
                    )}
                    {clip.status && clip.status !== 'complete' && (
                      <span className="absolute top-2 left-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-black/80 text-zinc-200 backdrop-blur">
                        {clip.status}
                      </span>
                    )}
                  </div>
                  <div className="p-2.5">
                    <div className="text-xs text-zinc-200 truncate font-medium">
                      {clip.title || 'Untitled clip'}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

      </div>

      {/* Tiny CSS — keep it inline so we don't pollute global styles */}
      <style jsx>{`
        @keyframes wave {
          0%, 60%, 100% { transform: rotate(0deg); }
          10%, 30% { transform: rotate(14deg); }
          20% { transform: rotate(-8deg); }
          40% { transform: rotate(-4deg); }
          50% { transform: rotate(10deg); }
        }
        .animate-wave {
          display: inline-block;
          transform-origin: 70% 70%;
          animation: wave 2.5s ease-in-out 0.5s 2;
        }
      `}</style>
    </div>
  );
}
