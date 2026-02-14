'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Target, Clock, TrendingUp, AlertTriangle, CheckCircle2, DollarSign, Video, FileText } from 'lucide-react';

interface TierProgress {
  hit: boolean;
  target: number;
  payout: number;
  videos?: number;
  gmv?: number;
}

interface LinkedBrief {
  id: string;
  title: string;
  status: string;
  income_projections: unknown;
}

interface Retainer {
  brand_id: string;
  brand_name: string;
  retainer_type: string;
  period_start: string | null;
  period_end: string | null;
  days_remaining: number | null;
  video_goal: number;
  videos_posted: number;
  pipeline_posted: number;
  tiktok_posted: number;
  completion: number;
  base_payout: number;
  bonus_earned: number;
  total_bonus_potential: number;
  tier_progress: TierProgress[];
  next_bonus_amount: number;
  next_bonus_needed: number;
  daily_pace: number;
  projected_total: number;
  videos_needed: number;
  status: string;
  notes: string | null;
  linked_brief: LinkedBrief | null;
}

interface Summary {
  total_brands: number;
  total_base: number;
  total_potential: number;
  total_videos_needed: number;
  brands_on_track: number;
  brands_at_risk: number;
  brands_completed: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  on_track: { label: 'ON TRACK', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: TrendingUp },
  at_risk: { label: 'AT RISK', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', icon: AlertTriangle },
  behind: { label: 'BEHIND', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', icon: AlertTriangle },
  completed: { label: 'COMPLETED', color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/20', icon: CheckCircle2 },
  expired: { label: 'EXPIRED', color: 'text-zinc-400', bg: 'bg-zinc-500/10 border-zinc-500/20', icon: Clock },
};

const TYPE_LABELS: Record<string, string> = {
  retainer: 'Retainer',
  bonus: 'Bonus',
  challenge: 'Challenge',
  affiliate: 'Affiliate',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RetainersPage() {
  const [data, setData] = useState<{ retainers: Retainer[]; summary: Summary } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/retainers', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Retainer Tracking</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-zinc-800/50 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 bg-zinc-800/50 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.retainers.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Retainer Tracking</h1>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Target className="w-16 h-16 text-zinc-600 mb-4" />
          <h2 className="text-xl font-semibold text-zinc-300 mb-2">No active retainers yet</h2>
          <p className="text-zinc-500 max-w-md mb-6">
            Add retainer details to your brands on the Brands page, or paste a brand brief on the Briefs page to auto-extract retainer info.
          </p>
          <div className="flex gap-3">
            <Link href="/admin/brands" className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors">
              Go to Brands
            </Link>
            <Link href="/admin/briefs" className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors">
              Go to Briefs
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { retainers, summary } = data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Retainer Tracking</h1>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
            <DollarSign className="w-4 h-4" />
            Total Monthly Base
          </div>
          <div className="text-2xl font-bold text-emerald-400">{formatCurrency(summary.total_base)}</div>
        </div>
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
            <TrendingUp className="w-4 h-4" />
            Total Bonus Potential
          </div>
          <div className="text-2xl font-bold text-amber-400">{formatCurrency(summary.total_potential - summary.total_base)}</div>
        </div>
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
            <Video className="w-4 h-4" />
            Videos Still Needed
          </div>
          <div className="text-2xl font-bold text-white">{summary.total_videos_needed}</div>
        </div>
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
            <AlertTriangle className="w-4 h-4" />
            Brands At Risk
          </div>
          <div className={`text-2xl font-bold ${summary.brands_at_risk > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {summary.brands_at_risk}
          </div>
        </div>
      </div>

      {/* Retainer Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {retainers.map((r) => {
          const statusCfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.on_track;
          const StatusIcon = statusCfg.icon;

          return (
            <div key={r.brand_id} className="bg-zinc-900 border border-zinc-700/50 rounded-xl p-5 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">{r.brand_name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 uppercase tracking-wider">
                    {TYPE_LABELS[r.retainer_type] || r.retainer_type}
                  </span>
                </div>
                <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusCfg.bg} ${statusCfg.color}`}>
                  <StatusIcon className="w-3.5 h-3.5" />
                  {statusCfg.label}
                </div>
              </div>

              {/* Progress Bar */}
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-sm text-zinc-400">
                    <span className="text-white font-semibold">{r.videos_posted}</span> of {r.video_goal} videos
                  </span>
                  <span className="text-sm font-medium text-zinc-300">{r.completion}%</span>
                </div>
                <div className="w-full h-3 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, r.completion)}%` }}
                  />
                </div>
              </div>

              {/* Stats Row */}
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="text-zinc-500">Base:</span>{' '}
                  <span className="text-emerald-400 font-medium">{formatCurrency(r.base_payout)}</span>
                </div>
                {r.days_remaining !== null && (
                  <div>
                    <span className="text-zinc-500">Days left:</span>{' '}
                    <span className={`font-medium ${r.days_remaining < 7 ? 'text-red-400' : r.days_remaining < 14 ? 'text-amber-400' : 'text-zinc-300'}`}>
                      {r.days_remaining}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-zinc-500">Period:</span>{' '}
                  <span className="text-zinc-300">{formatDate(r.period_start)} — {formatDate(r.period_end)}</span>
                </div>
              </div>

              {/* Bonus Tiers */}
              {r.tier_progress.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Bonus Tiers</div>
                  {r.tier_progress.map((tier, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between text-sm px-3 py-1.5 rounded-lg ${
                        tier.hit
                          ? 'bg-emerald-500/10 border border-emerald-500/20'
                          : r.next_bonus_needed > 0 && tier.target === r.videos_posted + r.next_bonus_needed
                            ? 'bg-amber-500/5 border border-amber-500/20'
                            : 'bg-zinc-800/50'
                      }`}
                    >
                      <span className="text-zinc-300">
                        {tier.target} videos
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={tier.hit ? 'text-emerald-400 font-medium' : 'text-zinc-400'}>
                          {formatCurrency(tier.payout)}
                        </span>
                        {tier.hit ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <span className="text-xs text-zinc-500">
                            {tier.target - r.videos_posted} more
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {r.bonus_earned > 0 && (
                    <div className="text-xs text-emerald-400 mt-1">
                      Bonus earned so far: {formatCurrency(r.bonus_earned)}
                    </div>
                  )}
                </div>
              )}

              {/* Pace Projection */}
              {r.daily_pace > 0 && r.status !== 'completed' && r.status !== 'expired' && (
                <div className="text-sm text-zinc-400 bg-zinc-800/30 rounded-lg px-3 py-2">
                  <TrendingUp className="w-3.5 h-3.5 inline mr-1.5 text-zinc-500" />
                  At your current pace ({r.daily_pace} videos/day), you&apos;ll hit{' '}
                  <span className="text-white font-medium">{r.projected_total} videos</span> by deadline
                  {r.projected_total >= r.video_goal ? (
                    <span className="text-emerald-400 ml-1">— on track</span>
                  ) : (
                    <span className="text-amber-400 ml-1">— {r.videos_needed} more needed</span>
                  )}
                </div>
              )}

              {/* Linked Brief */}
              {r.linked_brief && (
                <Link
                  href={`/admin/briefs?id=${r.linked_brief.id}`}
                  className="flex items-center gap-2 text-sm text-teal-400 hover:text-teal-300 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  View analyzed brief: {r.linked_brief.title}
                </Link>
              )}

              {/* Notes */}
              {r.notes && (
                <div className="text-sm text-zinc-500 italic border-t border-zinc-800 pt-3">
                  {r.notes}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
