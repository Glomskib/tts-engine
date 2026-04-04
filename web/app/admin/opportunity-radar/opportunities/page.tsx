'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import AdminPageLayout, { AdminCard, AdminButton, EmptyState } from '../../components/AdminPageLayout';
import { SkeletonAuthCheck, SkeletonTable } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';

// ── Types ────────────────────────────────────────────────────────

interface OpportunityRow {
  id: string;
  score: number;
  score_breakdown: { reasons?: string[]; total?: number } | null;
  status: string;
  action_type: string | null;
  action_ref_id: string | null;
  notes: string | null;
  observation: {
    id: string;
    product_name: string;
    product_url: string | null;
    brand_name: string | null;
    confidence: string;
    creator_has_posted: boolean;
    first_seen_at: string;
    times_seen: number;
    creator: {
      id: string;
      handle: string;
      display_name: string | null;
      platform: string;
      priority: string;
      niche: string | null;
    } | null;
  } | null;
}

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'actioned', label: 'Actioned' },
  { value: 'dismissed', label: 'Dismissed' },
];

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  new: { bg: 'bg-blue-400/10', text: 'text-blue-400' },
  reviewed: { bg: 'bg-amber-400/10', text: 'text-amber-400' },
  actioned: { bg: 'bg-emerald-400/10', text: 'text-emerald-400' },
  dismissed: { bg: 'bg-zinc-400/10', text: 'text-zinc-400' },
};

// ── Component ────────────────────────────────────────────────────

export default function OpportunitiesPage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();

  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [nicheFilter, setNicheFilter] = useState('');
  const [notPostedOnly, setNotPostedOnly] = useState(false);

  // Score tooltip
  const [tooltipId, setTooltipId] = useState<string | null>(null);

  // Action loading
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Auth
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) { router.push('/login?redirect=/admin/opportunity-radar/opportunities'); return; }
        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();
        if (roleData.role !== 'admin') { router.push('/admin/pipeline'); return; }
        setIsAdmin(true);
      } catch {
        router.push('/login?redirect=/admin/opportunity-radar/opportunities');
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  // Fetch
  const fetchOpportunities = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (minScore > 0) params.set('min_score', String(minScore));
      if (nicheFilter) params.set('niche', nicheFilter);
      if (notPostedOnly) params.set('creator_has_posted', 'false');

      const res = await fetch(`/api/admin/opportunity-radar/opportunities?${params}`);
      const data = await res.json();
      if (data.ok) setOpportunities(data.data || []);
    } catch {
      showError('Failed to load opportunities');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, minScore, nicheFilter, notPostedOnly, showError]);

  useEffect(() => {
    if (isAdmin) fetchOpportunities();
  }, [isAdmin, fetchOpportunities]);

  // Actions
  const handleAction = async (oppId: string, action: { status?: string; action_type?: string }) => {
    setActionLoading(oppId);
    try {
      const res = await fetch('/api/admin/opportunity-radar/opportunities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: oppId, ...action }),
      });
      const data = await res.json();
      if (data.ok) {
        showSuccess(action.action_type
          ? `Created ${action.action_type.replace('_', ' ')}`
          : `Marked as ${action.status}`
        );
        fetchOpportunities();
      } else {
        showError(data.message || 'Action failed');
      }
    } catch {
      showError('Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  // Helpers
  function scoreColor(score: number) {
    if (score >= 75) return 'text-emerald-400';
    if (score >= 50) return 'text-amber-400';
    if (score >= 25) return 'text-blue-400';
    return 'text-zinc-400';
  }

  function scoreBg(score: number) {
    if (score >= 75) return 'bg-emerald-500';
    if (score >= 50) return 'bg-amber-500';
    if (score >= 25) return 'bg-blue-500';
    return 'bg-zinc-500';
  }

  if (authLoading) return <SkeletonAuthCheck />;
  if (!isAdmin) return null;

  return (
    <AdminPageLayout
      title="Opportunities"
      subtitle="Scored product opportunities ready for review and action"
      stage="research"
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Opportunity Radar', href: '/admin/opportunity-radar' },
        { label: 'Opportunities' },
      ]}
    >
      {/* Status tabs */}
      <div className="flex items-center gap-1 bg-zinc-900/50 rounded-lg p-1 border border-white/[0.08] w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              statusFilter === tab.value
                ? 'bg-violet-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Min score:</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="w-24 accent-violet-500"
          />
          <span className="text-xs text-zinc-300 tabular-nums w-6">{minScore}</span>
        </div>
        <input
          type="text"
          placeholder="Filter by niche..."
          value={nicheFilter}
          onChange={(e) => setNicheFilter(e.target.value)}
          className="bg-zinc-800 border border-white/10 text-zinc-100 rounded-lg px-3 py-1.5 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 w-40"
        />
        <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={notPostedOnly}
            onChange={(e) => setNotPostedOnly(e.target.checked)}
            className="rounded border-white/10 bg-zinc-800 accent-violet-500"
          />
          Not yet posted only
        </label>
      </div>

      {/* Opportunities Table */}
      <AdminCard noPadding>
        {loading ? (
          <SkeletonTable rows={10} cols={7} />
        ) : opportunities.length === 0 ? (
          <EmptyState
            title="No opportunities found"
            description="Opportunities are generated when you add product observations to watched creators."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Score</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Product</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Creator</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Confidence</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">First Seen</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((opp) => {
                  const obs = opp.observation;
                  const creator = obs?.creator;
                  const statusStyle = STATUS_BADGE[opp.status] || STATUS_BADGE.new;
                  const isLoading = actionLoading === opp.id;

                  return (
                    <tr key={opp.id} className="border-b border-white/[0.04] even:bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                      {/* Score with tooltip */}
                      <td className="px-4 py-3 relative">
                        <button
                          className={`font-bold tabular-nums ${scoreColor(opp.score)} flex items-center gap-1.5`}
                          onMouseEnter={() => setTooltipId(opp.id)}
                          onMouseLeave={() => setTooltipId(null)}
                        >
                          <span className={`w-2 h-2 rounded-full ${scoreBg(opp.score)}`} />
                          {opp.score}
                        </button>
                        {tooltipId === opp.id && opp.score_breakdown?.reasons && (
                          <div className="absolute left-0 top-full z-50 mt-1 w-72 bg-zinc-800 border border-white/10 rounded-lg p-3 shadow-xl">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Score Breakdown</div>
                            <ul className="space-y-1">
                              {opp.score_breakdown.reasons.map((r, i) => (
                                <li key={i} className="text-xs text-zinc-300">{r}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-zinc-200">{obs?.product_name || '—'}</div>
                        {obs?.brand_name && <div className="text-[11px] text-zinc-500">{obs.brand_name}</div>}
                        {obs?.creator_has_posted === false && (
                          <span className="text-[10px] text-amber-400">Not yet posted</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {creator ? (
                          <div>
                            <span className="text-zinc-300">@{creator.handle}</span>
                            {creator.niche && <div className="text-[11px] text-zinc-500">{creator.niche}</div>}
                          </div>
                        ) : '—'}
                      </td>

                      <td className="px-4 py-3">
                        <span className={`text-xs capitalize ${
                          obs?.confidence === 'confirmed' ? 'text-emerald-400' :
                          obs?.confidence === 'high' ? 'text-blue-400' :
                          obs?.confidence === 'medium' ? 'text-amber-400' :
                          'text-zinc-400'
                        }`}>
                          {obs?.confidence || '—'}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-xs text-zinc-400">
                        {obs?.first_seen_at ? new Date(obs.first_seen_at).toLocaleDateString() : '—'}
                      </td>

                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                          {opp.status}
                        </span>
                        {opp.action_type && (
                          <div className="text-[10px] text-zinc-500 mt-0.5">{opp.action_type.replace('_', ' ')}</div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {opp.status !== 'actioned' && opp.status !== 'dismissed' && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              onClick={() => handleAction(opp.id, { action_type: 'research' })}
                              disabled={isLoading}
                              className="text-[11px] px-2 py-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                            >
                              Research
                            </button>
                            <button
                              onClick={() => handleAction(opp.id, { action_type: 'content_item' })}
                              disabled={isLoading}
                              className="text-[11px] px-2 py-1 rounded bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 disabled:opacity-50"
                            >
                              Content
                            </button>
                            <button
                              onClick={() => handleAction(opp.id, { action_type: 'experiment' })}
                              disabled={isLoading}
                              className="text-[11px] px-2 py-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                            >
                              Experiment
                            </button>
                            {opp.status === 'new' && (
                              <button
                                onClick={() => handleAction(opp.id, { status: 'reviewed' })}
                                disabled={isLoading}
                                className="text-[11px] px-2 py-1 rounded bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 disabled:opacity-50"
                              >
                                Reviewed
                              </button>
                            )}
                            <button
                              onClick={() => handleAction(opp.id, { status: 'dismissed' })}
                              disabled={isLoading}
                              className="text-[11px] px-2 py-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 disabled:opacity-50"
                            >
                              Dismiss
                            </button>
                          </div>
                        )}
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
