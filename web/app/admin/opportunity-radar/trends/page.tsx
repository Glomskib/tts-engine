'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import AdminPageLayout, { AdminCard, EmptyState } from '../../components/AdminPageLayout';
import { SkeletonAuthCheck, SkeletonTable } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';

// ── Types ────────────────────────────────────────────────────────

interface TrendCluster {
  id: string;
  display_name: string;
  brand_name: string | null;
  primary_product_url: string | null;
  signal_count: number;
  creator_count: number;
  posted_creator_count: number;
  first_signal_at: string | null;
  last_signal_at: string | null;
  signals_24h: number;
  signals_prev_24h: number;
  velocity_score: number;
  trend_score: number;
  trend_label: string;
  score_breakdown: {
    velocity?: number;
    clustering?: number;
    early_signal?: number;
    confirmation?: number;
    recency?: number;
    reasons?: string[];
  } | null;
  saturation_score: number;
  earlyness_score: number;
  recommendation: string;
  forecast_breakdown: {
    saturation?: { score: number; reasons?: string[] };
    earlyness?: { score: number; reasons?: string[] };
    recommendation_reason?: string;
  } | null;
  status: string;
  created_at: string;
}

// ── Constants ────────────────────────────────────────────────────

const REC_TABS = [
  { value: '', label: 'All' },
  { value: 'ACT_NOW', label: 'Act Now' },
  { value: 'TEST_SOON', label: 'Test Soon' },
  { value: 'WATCH', label: 'Watch' },
  { value: 'SKIP', label: 'Skip' },
];

const REC_BADGE: Record<string, { bg: string; text: string; border: string }> = {
  ACT_NOW: { bg: 'bg-emerald-400/10', text: 'text-emerald-400', border: 'border-emerald-400/30' },
  TEST_SOON: { bg: 'bg-amber-400/10', text: 'text-amber-400', border: 'border-amber-400/30' },
  WATCH: { bg: 'bg-blue-400/10', text: 'text-blue-400', border: 'border-blue-400/30' },
  SKIP: { bg: 'bg-zinc-400/10', text: 'text-zinc-400', border: 'border-zinc-400/30' },
};

const LABEL_BADGE: Record<string, { bg: string; text: string; dot: string }> = {
  hot: { bg: 'bg-red-400/10', text: 'text-red-400', dot: 'bg-red-500' },
  rising: { bg: 'bg-amber-400/10', text: 'text-amber-400', dot: 'bg-amber-500' },
  warm: { bg: 'bg-blue-400/10', text: 'text-blue-400', dot: 'bg-blue-500' },
  cold: { bg: 'bg-zinc-400/10', text: 'text-zinc-400', dot: 'bg-zinc-500' },
};

const SORT_OPTIONS = [
  { value: 'trend_score', label: 'Trend Score' },
  { value: 'earlyness_score', label: 'Earlyness' },
  { value: 'saturation_score', label: 'Saturation' },
  { value: 'creator_count', label: 'Creators' },
  { value: 'last_signal_at', label: 'Last Signal' },
  { value: 'signals_24h', label: 'Velocity (24h)' },
];

// ── Component ────────────────────────────────────────────────────

export default function TrendsPage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();

  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clusters, setClusters] = useState<TrendCluster[]>([]);

  // Filters
  const [recFilter, setRecFilter] = useState('');
  const [sortBy, setSortBy] = useState('trend_score');
  const [sortAsc, setSortAsc] = useState(false);

  // Tooltip
  const [tooltipId, setTooltipId] = useState<string | null>(null);

  // Action loading
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Auth
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) { router.push('/login?redirect=/admin/opportunity-radar/trends'); return; }
        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();
        if (roleData.role !== 'admin') { router.push('/admin/pipeline'); return; }
        setIsAdmin(true);
      } catch {
        router.push('/login?redirect=/admin/opportunity-radar/trends');
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  // Fetch
  const fetchClusters = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (recFilter) params.set('recommendation', recFilter);
      params.set('sort', sortBy);
      if (sortAsc) params.set('dir', 'asc');

      const res = await fetch(`/api/admin/opportunity-radar/trends?${params}`);
      const data = await res.json();
      if (data.ok) setClusters(data.data || []);
    } catch {
      showError('Failed to load trends');
    } finally {
      setLoading(false);
    }
  }, [recFilter, sortBy, sortAsc, showError]);

  useEffect(() => {
    if (isAdmin) fetchClusters();
  }, [isAdmin, fetchClusters]);

  // Actions
  const handleAction = async (clusterId: string, action: string, extra?: Record<string, string>) => {
    setActionLoading(clusterId);
    try {
      const res = await fetch('/api/admin/opportunity-radar/trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: clusterId, action, ...extra }),
      });
      const data = await res.json();
      if (data.ok) {
        showSuccess(action === 'rescore' ? 'Rescored' : `Marked as ${extra?.status || action}`);
        fetchClusters();
      } else {
        showError(data.message || 'Action failed');
      }
    } catch {
      showError('Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  // Derived stats
  const actNowCount = clusters.filter((c) => c.recommendation === 'ACT_NOW').length;
  const testSoonCount = clusters.filter((c) => c.recommendation === 'TEST_SOON').length;
  const earlyLowSat = clusters.filter((c) => c.earlyness_score >= 50 && c.saturation_score <= 30).length;
  const totalSignals24h = clusters.reduce((sum, c) => sum + c.signals_24h, 0);

  function timeAgo(dateStr: string | null): string {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function growthIndicator(current: number, previous: number): string {
    if (previous === 0 && current > 0) return 'new';
    if (previous === 0) return '—';
    const pct = Math.round(((current - previous) / previous) * 100);
    if (pct > 0) return `+${pct}%`;
    if (pct < 0) return `${pct}%`;
    return 'flat';
  }

  function saturationLabel(score: number): { text: string; color: string } {
    if (score >= 60) return { text: 'Saturated', color: 'text-red-400' };
    if (score >= 35) return { text: 'Moderate', color: 'text-amber-400' };
    if (score >= 15) return { text: 'Light', color: 'text-blue-400' };
    return { text: 'Wide Open', color: 'text-emerald-400' };
  }

  function earlynessLabel(score: number): { text: string; color: string } {
    if (score >= 70) return { text: 'Very Early', color: 'text-emerald-400' };
    if (score >= 45) return { text: 'Early', color: 'text-blue-400' };
    if (score >= 20) return { text: 'Mid-cycle', color: 'text-amber-400' };
    return { text: 'Late', color: 'text-zinc-400' };
  }

  function recLabel(rec: string): string {
    switch (rec) {
      case 'ACT_NOW': return 'Act Now';
      case 'TEST_SOON': return 'Test Soon';
      case 'WATCH': return 'Watch';
      case 'SKIP': return 'Skip';
      default: return rec;
    }
  }

  if (authLoading) return <SkeletonAuthCheck />;
  if (!isAdmin) return null;

  return (
    <AdminPageLayout
      title="Trends & Forecasting"
      subtitle="What's rising, what's early, what to act on now"
      stage="research"
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Opportunity Radar', href: '/admin/opportunity-radar' },
        { label: 'Trends' },
      ]}
    >
      {/* Summary row — operator-first: what matters right now */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-emerald-900/20 border border-emerald-400/20 rounded-lg px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70">Act Now</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{actNowCount}</div>
        </div>
        <div className="bg-amber-900/20 border border-amber-400/20 rounded-lg px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70">Test Soon</div>
          <div className="text-2xl font-bold text-amber-400 mt-1">{testSoonCount}</div>
        </div>
        <div className="bg-zinc-900/50 border border-white/[0.08] rounded-lg px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Early + Open</div>
          <div className="text-2xl font-bold text-blue-400 mt-1">{earlyLowSat}</div>
        </div>
        <div className="bg-zinc-900/50 border border-white/[0.08] rounded-lg px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Signals (24h)</div>
          <div className="text-2xl font-bold text-zinc-200 mt-1">{totalSignals24h}</div>
        </div>
      </div>

      {/* Recommendation tabs + Sort */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-zinc-900/50 rounded-lg p-1 border border-white/[0.08]">
          {REC_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setRecFilter(tab.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                recFilter === tab.value
                  ? 'bg-violet-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-zinc-500">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-zinc-800 border border-white/10 text-zinc-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={() => setSortAsc(!sortAsc)}
            className="text-xs text-zinc-400 hover:text-zinc-200 px-1"
            title={sortAsc ? 'Ascending' : 'Descending'}
          >
            {sortAsc ? 'ASC' : 'DESC'}
          </button>
        </div>
      </div>

      {/* Clusters Table */}
      <AdminCard noPadding>
        {loading ? (
          <SkeletonTable rows={8} cols={8} />
        ) : clusters.length === 0 ? (
          <EmptyState
            title="No trend clusters yet"
            description="Clusters are created automatically when observations are ingested. Add observations to your watchlist to see trends."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Recommendation</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Product</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Trend</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Earlyness</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Saturation</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Creators</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Velocity</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clusters.map((cluster) => {
                  const recStyle = REC_BADGE[cluster.recommendation] || REC_BADGE.WATCH;
                  const labelStyle = LABEL_BADGE[cluster.trend_label] || LABEL_BADGE.cold;
                  const sat = saturationLabel(cluster.saturation_score);
                  const early = earlynessLabel(cluster.earlyness_score);
                  const isLoading = actionLoading === cluster.id;
                  const growth = growthIndicator(cluster.signals_24h, cluster.signals_prev_24h);

                  return (
                    <tr key={cluster.id} className="border-b border-white/[0.04] even:bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                      {/* Recommendation */}
                      <td className="px-4 py-3 relative">
                        <button
                          className="block text-left"
                          onMouseEnter={() => setTooltipId(cluster.id)}
                          onMouseLeave={() => setTooltipId(null)}
                        >
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border ${recStyle.bg} ${recStyle.text} ${recStyle.border}`}>
                            {recLabel(cluster.recommendation)}
                          </span>
                        </button>
                        {tooltipId === cluster.id && (
                          <div className="absolute left-0 top-full z-50 mt-1 w-80 bg-zinc-800 border border-white/10 rounded-lg p-3 shadow-xl">
                            {/* Forecast reason */}
                            {cluster.forecast_breakdown?.recommendation_reason && (
                              <p className="text-xs text-zinc-300 mb-2">{cluster.forecast_breakdown.recommendation_reason}</p>
                            )}

                            {/* Scores summary */}
                            <div className="grid grid-cols-3 gap-2 mb-2">
                              <div>
                                <div className="text-[10px] text-zinc-500 uppercase">Trend</div>
                                <div className={`text-sm font-bold ${labelStyle.text}`}>{cluster.trend_score}</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-zinc-500 uppercase">Earlyness</div>
                                <div className={`text-sm font-bold ${early.color}`}>{cluster.earlyness_score}</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-zinc-500 uppercase">Saturation</div>
                                <div className={`text-sm font-bold ${sat.color}`}>{cluster.saturation_score}</div>
                              </div>
                            </div>

                            {/* Trend breakdown */}
                            {cluster.score_breakdown && (
                              <div className="border-t border-white/[0.06] pt-2 mb-2">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Trend</div>
                                <div className="grid grid-cols-2 gap-1">
                                  {cluster.score_breakdown.velocity !== undefined && (
                                    <div className="text-xs text-zinc-400">Velocity: <span className="text-zinc-200">{cluster.score_breakdown.velocity}/30</span></div>
                                  )}
                                  {cluster.score_breakdown.clustering !== undefined && (
                                    <div className="text-xs text-zinc-400">Clustering: <span className="text-zinc-200">{cluster.score_breakdown.clustering}/25</span></div>
                                  )}
                                  {cluster.score_breakdown.early_signal !== undefined && (
                                    <div className="text-xs text-zinc-400">Early: <span className="text-zinc-200">{cluster.score_breakdown.early_signal}/20</span></div>
                                  )}
                                  {cluster.score_breakdown.confirmation !== undefined && (
                                    <div className="text-xs text-zinc-400">Confidence: <span className="text-zinc-200">{cluster.score_breakdown.confirmation}/15</span></div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Forecast reasons */}
                            {cluster.forecast_breakdown?.earlyness?.reasons && cluster.forecast_breakdown.earlyness.reasons.length > 0 && (
                              <div className="border-t border-white/[0.06] pt-2">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Signals</div>
                                <ul className="space-y-0.5">
                                  {[
                                    ...(cluster.forecast_breakdown.earlyness.reasons || []),
                                    ...(cluster.forecast_breakdown.saturation?.reasons || []),
                                  ].slice(0, 5).map((r, i) => (
                                    <li key={i} className="text-xs text-zinc-300">{r}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Product */}
                      <td className="px-4 py-3">
                        <div className="text-zinc-200 font-medium">{cluster.display_name}</div>
                        {cluster.brand_name && <div className="text-[11px] text-zinc-500">{cluster.brand_name}</div>}
                        <div className="text-[10px] text-zinc-500 mt-0.5">{timeAgo(cluster.last_signal_at)}</div>
                      </td>

                      {/* Trend */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${labelStyle.dot}`} />
                          <span className={`font-bold tabular-nums ${labelStyle.text}`}>{cluster.trend_score}</span>
                        </div>
                        <span className={`text-[10px] ${labelStyle.text}`}>{cluster.trend_label}</span>
                      </td>

                      {/* Earlyness */}
                      <td className="px-4 py-3">
                        <div className={`font-bold tabular-nums ${early.color}`}>{cluster.earlyness_score}</div>
                        <div className={`text-[10px] ${early.color}`}>{early.text}</div>
                      </td>

                      {/* Saturation */}
                      <td className="px-4 py-3">
                        <div className={`font-bold tabular-nums ${sat.color}`}>{cluster.saturation_score}</div>
                        <div className={`text-[10px] ${sat.color}`}>{sat.text}</div>
                      </td>

                      {/* Creators */}
                      <td className="px-4 py-3">
                        <span className="tabular-nums text-zinc-300">{cluster.creator_count}</span>
                        {cluster.posted_creator_count > 0 && (
                          <span className="text-[10px] text-zinc-500 ml-1">({cluster.posted_creator_count} posted)</span>
                        )}
                      </td>

                      {/* Velocity */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="tabular-nums text-zinc-300">{cluster.signals_24h}</span>
                          <span className={`text-[10px] ${
                            growth.startsWith('+') ? 'text-emerald-400' :
                            growth.startsWith('-') ? 'text-red-400' :
                            growth === 'new' ? 'text-blue-400' :
                            'text-zinc-500'
                          }`}>
                            {growth}
                          </span>
                        </div>
                      </td>

                      {/* Actions — stronger for ACT_NOW */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {cluster.recommendation === 'ACT_NOW' && cluster.status !== 'actioned' && (
                            <button
                              onClick={() => handleAction(cluster.id, 'set_status', { status: 'actioned' })}
                              disabled={isLoading}
                              className="text-[11px] px-2 py-1 rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-50 font-semibold"
                            >
                              Create Content
                            </button>
                          )}
                          {cluster.recommendation === 'TEST_SOON' && cluster.status !== 'actioned' && (
                            <button
                              onClick={() => handleAction(cluster.id, 'set_status', { status: 'actioned' })}
                              disabled={isLoading}
                              className="text-[11px] px-2 py-1 rounded bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 disabled:opacity-50"
                            >
                              Research
                            </button>
                          )}
                          <button
                            onClick={() => handleAction(cluster.id, 'rescore')}
                            disabled={isLoading}
                            className="text-[11px] px-2 py-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                          >
                            Rescore
                          </button>
                          {cluster.status !== 'dismissed' && (
                            <button
                              onClick={() => handleAction(cluster.id, 'dismiss')}
                              disabled={isLoading}
                              className="text-[11px] px-2 py-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 disabled:opacity-50"
                            >
                              Dismiss
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </AdminPageLayout>
  );
}
