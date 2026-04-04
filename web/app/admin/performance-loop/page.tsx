'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Zap,
  FileText,
  Package,
  Target,
  ArrowRight,
  AlertCircle,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import AdminPageLayout, { AdminCard } from '@/app/admin/components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';

// ── Types (matching ProfileSummary from creator-profile.ts) ──

interface DimensionEntry {
  value: string;
  sample_size: number;
  avg_score: number;
  avg_views: number;
  win_rate: number;
  confidence: string;
}

interface ProfileData {
  workspace_id: string;
  total_posts: number;
  total_views: number;
  avg_engagement_rate: number;
  median_views: number;
  best_score: number;
  dimensions: Record<string, DimensionEntry[]>;
  last_aggregated_at: string;
}

// ── Dimension display config ──

const DIMENSION_CONFIG: Record<string, { label: string; icon: typeof Zap; description: string }> = {
  hook_pattern: { label: 'Hook Patterns', icon: Zap, description: 'Which opening styles get the best results' },
  hook_type: { label: 'Hook Types', icon: Zap, description: 'What kind of hooks perform best' },
  angle: { label: 'Content Angles', icon: Target, description: 'Which topics and approaches land hardest' },
  format: { label: 'Content Formats', icon: FileText, description: 'Which video structures your audience prefers' },
  platform: { label: 'Platforms', icon: BarChart3, description: 'Where your content performs best' },
  length_bucket: { label: 'Video Length', icon: BarChart3, description: 'What duration gets the most engagement' },
  product: { label: 'Products', icon: Package, description: 'Which products your audience responds to' },
};

const CONFIDENCE_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: 'Strong signal', color: 'text-teal-400' },
  medium: { label: 'Growing signal', color: 'text-amber-400' },
  low: { label: 'Early signal', color: 'text-zinc-500' },
};

export default function PerformanceLoopPage() {
  const { showSuccess, showError } = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/creator-profile', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load profile');
      const data = await res.json();
      setProfile(data.data || null);
    } catch {
      showError('Failed to load performance profile');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/admin/creator-profile', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      showSuccess(`Profile updated: ${data.data?.total_posts || 0} posts analyzed, ${data.data?.dimensions_updated || 0} patterns tracked`);
      // Re-fetch the full profile
      await fetchProfile();
    } catch {
      showError('Failed to refresh profile');
    } finally {
      setRefreshing(false);
    }
  };

  const hasData = profile && profile.total_posts > 0;
  const dims = profile?.dimensions || {};

  // Determine which dimensions have enough data to show
  const activeDimensions = Object.entries(dims)
    .filter(([, entries]) => entries.length > 0)
    .sort((a, b) => {
      // Show highest-confidence dimensions first
      const confOrder = { high: 0, medium: 1, low: 2 };
      const aConf = a[1][0]?.confidence || 'low';
      const bConf = b[1][0]?.confidence || 'low';
      return (confOrder[aConf as keyof typeof confOrder] ?? 2) - (confOrder[bConf as keyof typeof confOrder] ?? 2);
    });

  // Extract top insights for the summary
  const topHookPattern = dims.hook_pattern?.[0];
  const topAngle = dims.angle?.[0];
  const topFormat = dims.format?.[0];
  const topLength = dims.length_bucket?.[0];

  return (
    <AdminPageLayout
      title="Performance Loop"
      subtitle="What works for you — and how FlashFlow uses it"
      stage="create"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-3">
          {profile?.last_aggregated_at && (
            <span className="text-xs text-zinc-500">
              Last updated: {new Date(profile.last_aggregated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {refreshing ? (
            <><Loader2 size={14} className="animate-spin" /> Analyzing...</>
          ) : (
            <><RefreshCw size={14} /> Refresh Profile</>
          )}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasData && (
        <AdminCard>
          <div className="text-center py-12">
            <BarChart3 size={32} className="text-zinc-600 mx-auto mb-3" />
            <p className="text-sm text-zinc-400 mb-2">Not enough data for performance insights yet</p>
            <p className="text-xs text-zinc-500 max-w-md mx-auto mb-4">
              Performance Loop learns from your posted content. As you create, post, and track results,
              FlashFlow builds a profile of what works specifically for your audience.
            </p>
            <div className="text-xs text-zinc-500 max-w-sm mx-auto space-y-2 text-left mb-6">
              <p className="font-medium text-zinc-400">What improves your insights:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Post content and track it in the pipeline</li>
                <li>Add performance metrics to your posts</li>
                <li>Use different hook styles across videos</li>
                <li>Try different formats and structures</li>
              </ul>
            </div>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/admin/content-studio"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Sparkles size={14} /> Create Content
              </Link>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-lg border border-zinc-700 transition-colors"
              >
                <RefreshCw size={14} /> Check Again
              </button>
            </div>
          </div>
        </AdminCard>
      )}

      {/* Profile content */}
      {!loading && hasData && (
        <>
          {/* Summary card */}
          <AdminCard>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-sm font-medium text-white">What Works For You</h2>
              <span className="text-[10px] text-zinc-500 font-mono">{profile!.total_posts} posts analyzed</span>
            </div>

            {/* Quick insights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              {topHookPattern && (
                <InsightCard
                  label="Strongest hook style"
                  value={`"${topHookPattern.value}"`}
                  score={topHookPattern.avg_score}
                  winRate={topHookPattern.win_rate}
                  confidence={topHookPattern.confidence}
                  samples={topHookPattern.sample_size}
                />
              )}
              {topAngle && (
                <InsightCard
                  label="Best content angle"
                  value={`"${topAngle.value}"`}
                  score={topAngle.avg_score}
                  winRate={topAngle.win_rate}
                  confidence={topAngle.confidence}
                  samples={topAngle.sample_size}
                />
              )}
              {topFormat && (
                <InsightCard
                  label="Best format"
                  value={topFormat.value}
                  score={topFormat.avg_score}
                  winRate={topFormat.win_rate}
                  confidence={topFormat.confidence}
                  samples={topFormat.sample_size}
                />
              )}
              {topLength && (
                <InsightCard
                  label="Optimal length"
                  value={topLength.value}
                  score={topLength.avg_score}
                  winRate={topLength.win_rate}
                  confidence={topLength.confidence}
                  samples={topLength.sample_size}
                />
              )}
            </div>

            {/* How it's used */}
            <div className="p-3 bg-teal-500/5 border border-teal-500/10 rounded-lg">
              <p className="text-xs text-teal-400 font-medium mb-1">How FlashFlow uses this</p>
              <p className="text-xs text-zinc-400">
                Your performance profile automatically shapes hook generation, script writing, and content packs.
                When FlashFlow creates content for you, it biases toward your proven patterns and avoids your weak ones.
              </p>
            </div>
          </AdminCard>

          {/* Overall stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <StatCard label="Total views" value={formatNumber(profile!.total_views)} />
            <StatCard label="Avg engagement" value={`${profile!.avg_engagement_rate.toFixed(1)}%`} />
            <StatCard label="Median views" value={formatNumber(profile!.median_views)} />
            <StatCard label="Best score" value={String(profile!.best_score)} />
          </div>

          {/* Dimension breakdowns */}
          <div className="mt-6 space-y-4">
            <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">Pattern Breakdowns</h2>

            {activeDimensions.map(([dimKey, entries]) => {
              const config = DIMENSION_CONFIG[dimKey];
              if (!config) return null;
              const DimIcon = config.icon;
              const confLevel = entries[0]?.confidence || 'low';
              const confStyle = CONFIDENCE_LABELS[confLevel] || CONFIDENCE_LABELS.low;

              return (
                <AdminCard key={dimKey}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <DimIcon size={14} className="text-teal-400" />
                      <div>
                        <h3 className="text-sm font-medium text-white">{config.label}</h3>
                        <p className="text-[11px] text-zinc-500">{config.description}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium ${confStyle.color}`}>
                      {confStyle.label}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {entries.slice(0, 5).map((entry, i) => (
                      <div
                        key={entry.value}
                        className="flex items-center justify-between p-2 bg-zinc-800/50 rounded-lg"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-mono text-zinc-600 w-4 shrink-0">#{i + 1}</span>
                          <span className="text-xs text-zinc-300 truncate">{entry.value}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[10px] text-zinc-500">{entry.sample_size} posts</span>
                          {entry.avg_views > 0 && (
                            <span className="text-[10px] text-zinc-500">{formatNumber(entry.avg_views)} views</span>
                          )}
                          {entry.win_rate > 0 && (
                            <span className="text-[10px] text-amber-400">{entry.win_rate.toFixed(0)}% wins</span>
                          )}
                          <ScoreBar score={entry.avg_score} />
                        </div>
                      </div>
                    ))}
                  </div>
                </AdminCard>
              );
            })}

            {activeDimensions.length === 0 && (
              <AdminCard>
                <div className="flex items-center gap-2 text-xs text-zinc-500 py-4">
                  <AlertCircle size={14} />
                  <span>No pattern breakdowns available yet. Need at least 2 posts per pattern to start tracking.</span>
                </div>
              </AdminCard>
            )}
          </div>

          {/* Quick actions */}
          <div className="mt-6">
            <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide mb-3">Create From Your Strengths</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Link
                href="/admin/hook-generator"
                className="group flex items-center justify-between p-3 bg-zinc-900/60 border border-white/10 hover:border-teal-500/30 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Zap size={14} className="text-teal-400" />
                  <span className="text-xs text-zinc-300">Generate hooks from your best patterns</span>
                </div>
                <ArrowRight size={14} className="text-zinc-600 group-hover:text-teal-400 transition-colors" />
              </Link>
              <Link
                href="/admin/content-studio"
                className="group flex items-center justify-between p-3 bg-zinc-900/60 border border-white/10 hover:border-teal-500/30 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-violet-400" />
                  <span className="text-xs text-zinc-300">Write scripts shaped by your wins</span>
                </div>
                <ArrowRight size={14} className="text-zinc-600 group-hover:text-teal-400 transition-colors" />
              </Link>
              <Link
                href="/admin/content-pack"
                className="group flex items-center justify-between p-3 bg-zinc-900/60 border border-white/10 hover:border-teal-500/30 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Package size={14} className="text-blue-400" />
                  <span className="text-xs text-zinc-300">Build a pack using proven angles</span>
                </div>
                <ArrowRight size={14} className="text-zinc-600 group-hover:text-teal-400 transition-colors" />
              </Link>
            </div>
          </div>
        </>
      )}
    </AdminPageLayout>
  );
}

// ── Sub-components ──

function InsightCard({ label, value, score, winRate, confidence, samples }: {
  label: string;
  value: string;
  score: number;
  winRate: number;
  confidence: string;
  samples: number;
}) {
  const confStyle = CONFIDENCE_LABELS[confidence] || CONFIDENCE_LABELS.low;

  return (
    <div className="p-3 bg-zinc-800/50 border border-white/5 rounded-lg">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-white font-medium truncate mb-1">{value}</p>
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-teal-400">Score: {score.toFixed(0)}</span>
        {winRate > 0 && <span className="text-amber-400">{winRate.toFixed(0)}% wins</span>}
        <span className={confStyle.color}>{samples} posts</span>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-zinc-900/60 border border-white/10 rounded-lg text-center">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-lg font-mono text-white">{value}</p>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const maxScore = 100;
  const pct = Math.min(100, Math.max(0, (score / maxScore) * 100));
  const color = pct >= 70 ? 'bg-teal-400' : pct >= 40 ? 'bg-amber-400' : 'bg-zinc-600';

  return (
    <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
