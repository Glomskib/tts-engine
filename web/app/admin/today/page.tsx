'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Loader2,
  RefreshCw,
  Lightbulb,
  Package,
  MessageSquare,
  TrendingUp,
  ArrowRight,
  Sparkles,
  Zap,
  FileText,
  Eye,
  Heart,
  Share2,
  Pickaxe,
  Clock,
  Video,
  Send,
  BarChart3,
} from 'lucide-react';
import AdminPageLayout, { AdminCard } from '@/app/admin/components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';

// ── Types ──

interface Opportunity {
  id: string;
  topic: string;
  recommendation: string;
  score: number;
  earlyness: number;
  velocity_24h: number;
  best_hook: string | null;
  suggested_angle: string | null;
  saved: boolean;
}

interface PackSummary {
  id: string;
  topic: string;
  source_type: string;
  status: Record<string, string>;
  favorited: boolean;
  created_at: string;
}

interface CommentTheme {
  id: string;
  theme: string;
  category: string;
  opportunity_score: number;
  comment_count: number;
  content_angle: string;
  suggested_actions: Array<{ type: string; label: string }>;
}

interface TopPattern {
  value: string;
  score: number;
  win_rate: number;
  samples: number;
}

interface Performance {
  total_posts: number;
  total_views: number;
  avg_engagement_rate: number;
  top_patterns: Record<string, TopPattern>;
  last_aggregated_at: string;
}

interface TopVideo {
  title: string;
  platform: string;
  posted_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

interface DraftScript {
  id: string;
  title: string;
  product_name: string | null;
  created_at: string;
}

interface TodayData {
  opportunities: Opportunity[];
  recent_packs: PackSummary[];
  comment_themes: CommentTheme[];
  performance: Performance | null;
  pipeline: { counts: Record<string, number>; total: number };
  recent_drafts: DraftScript[];
  top_video: TopVideo | null;
}

// ── Helpers ──

function enc(s: string) { return encodeURIComponent(s); }

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const REC_COLORS: Record<string, string> = {
  ACT_NOW: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  TEST_SOON: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

const REC_LABELS: Record<string, string> = {
  ACT_NOW: 'Act now',
  TEST_SOON: 'Test soon',
};

const CATEGORY_COLORS: Record<string, string> = {
  question: 'text-blue-400',
  objection: 'text-red-400',
  request: 'text-violet-400',
  pain_point: 'text-orange-400',
  praise_pattern: 'text-amber-400',
  controversy: 'text-rose-400',
};

// ── Page ──

export default function TodayPage() {
  const { showError } = useToast();
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/creator/today', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setData(json.data || null);
    } catch {
      showError('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <AdminPageLayout title="Today" subtitle="Loading your daily briefing..." stage="create">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
        </div>
      </AdminPageLayout>
    );
  }

  const hasAnything = data && (
    data.opportunities.length > 0 ||
    data.recent_packs.length > 0 ||
    data.comment_themes.length > 0 ||
    data.performance !== null ||
    data.pipeline.total > 0 ||
    data.recent_drafts.length > 0 ||
    data.top_video !== null
  );

  return (
    <AdminPageLayout
      title="Today"
      subtitle="Your daily briefing — what to make, what's ready, what's working"
      stage="create"
      headerActions={
        <button
          onClick={() => { setLoading(true); fetchData(); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      }
    >
      {/* First-run empty state */}
      {!hasAnything && (
        <AdminCard>
          <div className="text-center py-12">
            <Sparkles size={32} className="text-teal-400 mx-auto mb-3" />
            <h2 className="text-sm font-medium text-white mb-2">Welcome to your daily dashboard</h2>
            <p className="text-xs text-zinc-500 max-w-md mx-auto mb-6">
              This page shows your top opportunities, content ideas, audience insights, and pipeline status — all in one place. As you use FlashFlow, this fills up with real data.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto">
              <Link
                href="/admin/content-studio"
                className="flex flex-col items-center gap-2 p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl hover:border-teal-500/30 transition-colors"
              >
                <Sparkles size={18} className="text-teal-400" />
                <span className="text-xs text-zinc-300">Write a script</span>
              </Link>
              <Link
                href="/admin/hook-generator"
                className="flex flex-col items-center gap-2 p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl hover:border-teal-500/30 transition-colors"
              >
                <Zap size={18} className="text-teal-400" />
                <span className="text-xs text-zinc-300">Generate hooks</span>
              </Link>
              <Link
                href="/admin/content-pack"
                className="flex flex-col items-center gap-2 p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl hover:border-teal-500/30 transition-colors"
              >
                <Package size={18} className="text-teal-400" />
                <span className="text-xs text-zinc-300">Build a content pack</span>
              </Link>
            </div>
          </div>
        </AdminCard>
      )}

      {hasAnything && data && (
        <div className="space-y-6">

          {/* ── Section 1: What To Make ── */}
          {data.opportunities.length > 0 && (
            <section>
              <SectionHeader
                icon={Lightbulb}
                title="What To Make"
                subtitle="Trending opportunities worth acting on"
                linkHref="/admin/opportunities"
                linkLabel="All opportunities"
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {data.opportunities.map(opp => (
                  <div
                    key={opp.id}
                    className="p-4 bg-zinc-900/60 border border-white/10 hover:border-white/20 rounded-xl transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium border rounded ${REC_COLORS[opp.recommendation] || REC_COLORS.TEST_SOON}`}>
                        {REC_LABELS[opp.recommendation] || opp.recommendation}
                      </span>
                      <span className="text-xs font-mono text-teal-400">{opp.score}</span>
                    </div>
                    <h3 className="text-sm font-medium text-white mb-1">{opp.topic}</h3>
                    {opp.suggested_angle && (
                      <p className="text-xs text-zinc-500 mb-3 line-clamp-2">{opp.suggested_angle}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      <Link
                        href={`/admin/hook-generator?product=${enc(opp.topic)}`}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded transition-colors"
                      >
                        <Zap size={10} className="text-teal-400" /> Make Hooks
                      </Link>
                      <Link
                        href={`/admin/content-pack?topic=${enc(opp.topic)}&source=opportunity`}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded transition-colors"
                      >
                        <Package size={10} className="text-blue-400" /> Build Pack
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Section 2: From Your Audience ── */}
          {data.comment_themes.length > 0 && (
            <section>
              <SectionHeader
                icon={MessageSquare}
                title="From Your Audience"
                subtitle="Comment themes worth making content about"
                linkHref="/admin/comment-miner"
                linkLabel="All themes"
              />
              <div className="space-y-2">
                {data.comment_themes.map(theme => (
                  <div
                    key={theme.id}
                    className="flex items-center justify-between p-3 bg-zinc-900/60 border border-white/10 rounded-xl"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-medium ${CATEGORY_COLORS[theme.category] || 'text-zinc-400'}`}>
                          {theme.category.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] text-zinc-600">{theme.comment_count} comments</span>
                      </div>
                      <p className="text-sm text-white truncate">{theme.theme}</p>
                      <p className="text-xs text-zinc-500 truncate">{theme.content_angle}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-3">
                      <Link
                        href={`/admin/hook-generator?product=${enc(theme.theme)}`}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded transition-colors"
                      >
                        <Zap size={10} /> Hooks
                      </Link>
                      <Link
                        href={`/admin/content-pack?topic=${enc(theme.theme)}&source=comment&context=${enc(theme.content_angle)}`}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded transition-colors"
                      >
                        <Package size={10} /> Pack
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Section 3: Ready To Go (Pipeline + Drafts) ── */}
          {(data.pipeline.total > 0 || data.recent_drafts.length > 0 || data.recent_packs.length > 0) && (
            <section>
              <SectionHeader
                icon={Video}
                title="Ready To Go"
                subtitle="Pick up where you left off"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Pipeline items */}
                {data.pipeline.counts.ready_to_post > 0 && (
                  <Link
                    href="/admin/posting-queue"
                    className="group flex items-center gap-3 p-3 bg-zinc-900/60 border border-white/10 hover:border-teal-500/30 rounded-xl transition-colors"
                  >
                    <div className="w-8 h-8 bg-teal-500/10 rounded-lg flex items-center justify-center shrink-0">
                      <Send size={14} className="text-teal-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{data.pipeline.counts.ready_to_post} ready to post</p>
                      <p className="text-[10px] text-zinc-500">Waiting to be published</p>
                    </div>
                    <ArrowRight size={14} className="text-zinc-600 group-hover:text-teal-400 transition-colors shrink-0 ml-auto" />
                  </Link>
                )}

                {data.pipeline.counts.ready_to_record > 0 && (
                  <Link
                    href="/admin/creator"
                    className="group flex items-center gap-3 p-3 bg-zinc-900/60 border border-white/10 hover:border-teal-500/30 rounded-xl transition-colors"
                  >
                    <div className="w-8 h-8 bg-violet-500/10 rounded-lg flex items-center justify-center shrink-0">
                      <Video size={14} className="text-violet-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{data.pipeline.counts.ready_to_record} ready to record</p>
                      <p className="text-[10px] text-zinc-500">Scripts approved, film these</p>
                    </div>
                    <ArrowRight size={14} className="text-zinc-600 group-hover:text-teal-400 transition-colors shrink-0 ml-auto" />
                  </Link>
                )}

                {(data.pipeline.counts.recorded ?? 0) + (data.pipeline.counts.editing ?? 0) > 0 && (
                  <Link
                    href="/admin/pipeline"
                    className="group flex items-center gap-3 p-3 bg-zinc-900/60 border border-white/10 hover:border-teal-500/30 rounded-xl transition-colors"
                  >
                    <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center shrink-0">
                      <Clock size={14} className="text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{(data.pipeline.counts.recorded ?? 0) + (data.pipeline.counts.editing ?? 0)} in editing</p>
                      <p className="text-[10px] text-zinc-500">Being edited now</p>
                    </div>
                    <ArrowRight size={14} className="text-zinc-600 group-hover:text-teal-400 transition-colors shrink-0 ml-auto" />
                  </Link>
                )}

                {/* Recent drafts */}
                {data.recent_drafts.map(draft => (
                  <Link
                    key={draft.id}
                    href={`/admin/script-library`}
                    className="group flex items-center gap-3 p-3 bg-zinc-900/60 border border-white/10 hover:border-teal-500/30 rounded-xl transition-colors"
                  >
                    <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center shrink-0">
                      <FileText size={14} className="text-zinc-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate">{draft.title || 'Untitled draft'}</p>
                      <p className="text-[10px] text-zinc-500">Draft script — {timeAgo(draft.created_at)}</p>
                    </div>
                    <ArrowRight size={14} className="text-zinc-600 group-hover:text-teal-400 transition-colors shrink-0 ml-auto" />
                  </Link>
                ))}

                {/* Recent packs */}
                {data.recent_packs.slice(0, 2).map(pack => (
                  <Link
                    key={pack.id}
                    href={`/admin/content-packs/${pack.id}`}
                    className="group flex items-center gap-3 p-3 bg-zinc-900/60 border border-white/10 hover:border-teal-500/30 rounded-xl transition-colors"
                  >
                    <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center shrink-0">
                      <Package size={14} className="text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate">{pack.topic}</p>
                      <p className="text-[10px] text-zinc-500">Content pack — {timeAgo(pack.created_at)}</p>
                    </div>
                    <ArrowRight size={14} className="text-zinc-600 group-hover:text-teal-400 transition-colors shrink-0 ml-auto" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ── Section 4: What's Working ── */}
          {(data.top_video || data.performance) && (
            <section>
              <SectionHeader
                icon={TrendingUp}
                title="What's Working"
                subtitle="Your recent performance and patterns"
                linkHref="/admin/performance-loop"
                linkLabel="Full profile"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Top video */}
                {data.top_video && (
                  <div className="p-4 bg-zinc-900/60 border border-white/10 rounded-xl">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">Top Video This Week</p>
                    <p className="text-sm font-medium text-white mb-2 line-clamp-2">{data.top_video.title}</p>
                    <div className="flex items-center gap-4 text-xs text-zinc-400">
                      <span className="inline-flex items-center gap-1"><Eye size={11} /> {formatNumber(data.top_video.views)}</span>
                      <span className="inline-flex items-center gap-1"><Heart size={11} /> {formatNumber(data.top_video.likes)}</span>
                      <span className="inline-flex items-center gap-1"><MessageSquare size={11} /> {formatNumber(data.top_video.comments)}</span>
                      <span className="inline-flex items-center gap-1"><Share2 size={11} /> {formatNumber(data.top_video.shares)}</span>
                    </div>
                    <div className="mt-3">
                      <Link
                        href={`/admin/content-pack?topic=${enc(data.top_video.title)}&source=topic&context=Based on my top performing video this week`}
                        className="inline-flex items-center gap-1 text-[10px] text-teal-400 hover:text-teal-300 transition-colors"
                      >
                        Make another one like this <ArrowRight size={10} />
                      </Link>
                    </div>
                  </div>
                )}

                {/* Performance patterns */}
                {data.performance && (
                  <div className="p-4 bg-zinc-900/60 border border-white/10 rounded-xl">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">Your Strongest Patterns</p>
                    <div className="space-y-2">
                      {data.performance.top_patterns.hook_pattern && (
                        <PatternRow
                          label="Best hook"
                          value={data.performance.top_patterns.hook_pattern.value}
                          winRate={data.performance.top_patterns.hook_pattern.win_rate}
                        />
                      )}
                      {data.performance.top_patterns.hook_type && (
                        <PatternRow
                          label="Best hook type"
                          value={data.performance.top_patterns.hook_type.value}
                          winRate={data.performance.top_patterns.hook_type.win_rate}
                        />
                      )}
                      {data.performance.top_patterns.angle && (
                        <PatternRow
                          label="Best angle"
                          value={data.performance.top_patterns.angle.value}
                          winRate={data.performance.top_patterns.angle.win_rate}
                        />
                      )}
                      {data.performance.top_patterns.format && (
                        <PatternRow
                          label="Best format"
                          value={data.performance.top_patterns.format.value}
                          winRate={data.performance.top_patterns.format.win_rate}
                        />
                      )}
                      {data.performance.top_patterns.length_bucket && (
                        <PatternRow
                          label="Best length"
                          value={data.performance.top_patterns.length_bucket.value}
                          winRate={data.performance.top_patterns.length_bucket.win_rate}
                        />
                      )}
                    </div>
                    {Object.keys(data.performance.top_patterns).length === 0 && (
                      <p className="text-xs text-zinc-500">
                        Not enough data yet. Post more content to see your patterns.
                      </p>
                    )}
                    <div className="mt-3 pt-2 border-t border-white/5 flex items-center gap-4 text-[10px] text-zinc-500">
                      <span>{data.performance.total_posts} posts</span>
                      <span>{formatNumber(data.performance.total_views)} views</span>
                      <span>{data.performance.avg_engagement_rate.toFixed(1)}% engagement</span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Section 5: Quick Create ── */}
          <section>
            <SectionHeader
              icon={Sparkles}
              title="Create Something"
              subtitle="Jump into your next piece of content"
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <QuickAction href="/admin/content-studio" icon={Sparkles} label="Write a Script" color="text-teal-400" bg="bg-teal-500/10" />
              <QuickAction href="/admin/hook-generator" icon={Zap} label="Generate Hooks" color="text-amber-400" bg="bg-amber-500/10" />
              <QuickAction href="/admin/content-pack" icon={Package} label="Build a Pack" color="text-blue-400" bg="bg-blue-500/10" />
              <QuickAction href="/admin/transcribe" icon={BarChart3} label="Break Down a Video" color="text-violet-400" bg="bg-violet-500/10" />
            </div>
          </section>

        </div>
      )}
    </AdminPageLayout>
  );
}

// ── Sub-components ──

function SectionHeader({ icon: Icon, title, subtitle, linkHref, linkLabel }: {
  icon: typeof Lightbulb;
  title: string;
  subtitle: string;
  linkHref?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-teal-400" />
        <div>
          <h2 className="text-sm font-medium text-white">{title}</h2>
          <p className="text-[10px] text-zinc-500">{subtitle}</p>
        </div>
      </div>
      {linkHref && linkLabel && (
        <Link
          href={linkHref}
          className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {linkLabel} <ArrowRight size={10} />
        </Link>
      )}
    </div>
  );
}

function PatternRow({ label, value, winRate }: { label: string; value: string; winRate: number }) {
  return (
    <div className="flex items-center justify-between">
      <div className="min-w-0">
        <span className="text-[10px] text-zinc-500">{label}: </span>
        <span className="text-xs text-zinc-300 truncate">{value}</span>
      </div>
      {winRate > 0 && (
        <span className="text-[10px] text-amber-400 shrink-0 ml-2">{winRate.toFixed(0)}% wins</span>
      )}
    </div>
  );
}

function QuickAction({ href, icon: Icon, label, color, bg }: {
  href: string;
  icon: typeof Sparkles;
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center gap-2 p-4 bg-zinc-900/60 border border-white/10 hover:border-teal-500/30 rounded-xl transition-colors"
    >
      <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center`}>
        <Icon size={14} className={color} />
      </div>
      <span className="text-xs text-zinc-400 group-hover:text-zinc-300 transition-colors">{label}</span>
    </Link>
  );
}
