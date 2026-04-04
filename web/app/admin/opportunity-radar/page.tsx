'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import AdminPageLayout, { AdminCard, AdminButton, EmptyState, StatCard } from '../components/AdminPageLayout';
import { SkeletonAuthCheck, SkeletonTable } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';

interface LimitsInfo {
  planName: string;
  maxCreators: number;
  currentCreators: number;
  scansPerDay: number;
  usagePercent: number;
  atLimit: boolean;
  upgradeMessage: string | null;
}

interface OpportunityRow {
  id: string;
  score: number;
  status: string;
  score_breakdown?: { reasons?: string[] };
  observation?: {
    product_name: string;
    confidence: string;
    creator_has_posted: boolean;
    first_seen_at: string;
    creator?: {
      handle: string;
      platform: string;
      niche: string | null;
    };
  };
}

export default function OpportunityRadarDashboard() {
  const router = useRouter();
  const { showError } = useToast();

  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [limits, setLimits] = useState<LimitsInfo | null>(null);
  const [totalCreators, setTotalCreators] = useState(0);
  const [totalObservations, setTotalObservations] = useState(0);
  const [hotOpportunities, setHotOpportunities] = useState<OpportunityRow[]>([]);
  const [needsReview, setNeedsReview] = useState(0);
  const [actNowClusters, setActNowClusters] = useState<Array<{ id: string; display_name: string; earlyness_score: number; saturation_score: number; trend_score: number }>>([]);
  const [risingEarly, setRisingEarly] = useState(0);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) { router.push('/login?redirect=/admin/opportunity-radar'); return; }
        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();
        if (roleData.role !== 'admin') { router.push('/admin/pipeline'); return; }
        setIsAdmin(true);
      } catch {
        router.push('/login?redirect=/admin/opportunity-radar');
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    if (!isAdmin) return;
    const fetchData = async () => {
      try {
        const [limitsRes, watchlistRes, obsRes, oppsRes, trendsRes] = await Promise.all([
          fetch('/api/admin/opportunity-radar/limits'),
          fetch('/api/admin/opportunity-radar/watchlist'),
          fetch('/api/admin/opportunity-radar/observations'),
          fetch('/api/admin/opportunity-radar/opportunities'),
          fetch('/api/admin/opportunity-radar/trends?sort=earlyness_score'),
        ]);

        const limitsData = await limitsRes.json();
        const watchlistData = await watchlistRes.json();
        const obsData = await obsRes.json();
        const oppsData = await oppsRes.json();
        const trendsData = await trendsRes.json();

        if (limitsData.ok) setLimits(limitsData.data);
        if (watchlistData.ok) setTotalCreators((watchlistData.data || []).length);
        if (obsData.ok) setTotalObservations((obsData.data || []).length);

        if (oppsData.ok) {
          const all = oppsData.data || [];
          setNeedsReview(all.filter((o: OpportunityRow) => o.status === 'new').length);
          setHotOpportunities(all.filter((o: OpportunityRow) => o.score >= 75).slice(0, 5));
        }

        if (trendsData.ok) {
          const allClusters = trendsData.data || [];
          setActNowClusters(
            allClusters
              .filter((c: { recommendation: string }) => c.recommendation === 'ACT_NOW')
              .slice(0, 3)
          );
          setRisingEarly(
            allClusters.filter((c: { earlyness_score: number; saturation_score: number; trend_score: number }) =>
              c.earlyness_score >= 50 && c.saturation_score <= 30 && c.trend_score >= 30
            ).length
          );
        }
      } catch {
        showError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isAdmin, showError]);

  if (authLoading) return <SkeletonAuthCheck />;
  if (!isAdmin) return null;

  function scoreColor(score: number) {
    if (score >= 75) return 'text-emerald-400';
    if (score >= 50) return 'text-amber-400';
    if (score >= 25) return 'text-blue-400';
    return 'text-zinc-400';
  }

  return (
    <AdminPageLayout
      title="Opportunity Radar"
      subtitle="Track creators and surface content opportunities"
      stage="research"
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Opportunity Radar' },
      ]}
      headerActions={
        <div className="flex items-center gap-2">
          <Link href="/admin/opportunity-radar/watchlist">
            <AdminButton variant="secondary" size="sm">Watchlist</AdminButton>
          </Link>
          <Link href="/admin/opportunity-feed">
            <AdminButton variant="secondary" size="sm">Feed</AdminButton>
          </Link>
          <Link href="/admin/opportunity-radar/trends">
            <AdminButton variant="secondary" size="sm">Trends</AdminButton>
          </Link>
          <Link href="/admin/hook-intelligence">
            <AdminButton variant="secondary" size="sm">Hooks</AdminButton>
          </Link>
          <Link href="/admin/alerts">
            <AdminButton variant="secondary" size="sm">Alerts</AdminButton>
          </Link>
          <Link href="/admin/opportunity-radar/opportunities">
            <AdminButton variant="primary" size="sm">Opportunities</AdminButton>
          </Link>
        </div>
      }
    >
      {/* Plan usage banner */}
      {limits && (
        <div className="bg-zinc-900/50 rounded-xl border border-white/[0.08] p-4 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-zinc-400">
            <span className="text-zinc-200 font-medium">{limits.planName}</span> plan
          </span>
          <span className="text-zinc-500">|</span>
          <span className="text-zinc-400">
            <span className="text-zinc-200 font-medium">{limits.currentCreators}</span> / {limits.maxCreators} creators watched
          </span>
          <span className="text-zinc-500">|</span>
          <span className="text-zinc-400">
            Scans up to <span className="text-zinc-200 font-medium">{limits.scansPerDay}x/day</span>
          </span>
          {limits.atLimit && limits.upgradeMessage && (
            <span className="text-amber-400 text-xs">{limits.upgradeMessage}</span>
          )}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Creators Watched" value={loading ? '...' : totalCreators} />
        <StatCard label="Observations" value={loading ? '...' : totalObservations} />
        <StatCard label="Hot Opportunities" value={loading ? '...' : hotOpportunities.length} variant="success" />
        <StatCard label="Needs Review" value={loading ? '...' : needsReview} variant="warning" />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/admin/opportunity-radar/watchlist" className="block">
          <div className="bg-zinc-900/50 rounded-xl border border-white/[0.08] p-5 hover:border-violet-500/30 transition-colors group">
            <h3 className="text-sm font-semibold text-zinc-200 mb-1 group-hover:text-violet-400 transition-colors">Creator Watchlist</h3>
            <p className="text-xs text-zinc-500">Manage tracked creators, add observations, and set priorities.</p>
          </div>
        </Link>
        <Link href="/admin/opportunity-radar/opportunities" className="block">
          <div className="bg-zinc-900/50 rounded-xl border border-white/[0.08] p-5 hover:border-emerald-500/30 transition-colors group">
            <h3 className="text-sm font-semibold text-zinc-200 mb-1 group-hover:text-emerald-400 transition-colors">Opportunities</h3>
            <p className="text-xs text-zinc-500">Review scored opportunities, take action, and track conversions.</p>
          </div>
        </Link>
        <Link href="/admin/opportunity-feed" className="block">
          <div className="bg-zinc-900/50 rounded-xl border border-white/[0.08] p-5 hover:border-emerald-500/30 transition-colors group">
            <h3 className="text-sm font-semibold text-zinc-200 mb-1 group-hover:text-emerald-400 transition-colors">Opportunity Feed</h3>
            <p className="text-xs text-zinc-500">What should you post today? Actionable products ranked by opportunity.</p>
          </div>
        </Link>
        <Link href="/admin/opportunity-radar/trends" className="block">
          <div className="bg-zinc-900/50 rounded-xl border border-white/[0.08] p-5 hover:border-red-500/30 transition-colors group">
            <h3 className="text-sm font-semibold text-zinc-200 mb-1 group-hover:text-red-400 transition-colors">Trends</h3>
            <p className="text-xs text-zinc-500">See which products are gaining momentum across multiple creators.</p>
          </div>
        </Link>
        <Link href="/admin/hook-intelligence" className="block">
          <div className="bg-zinc-900/50 rounded-xl border border-white/[0.08] p-5 hover:border-yellow-500/30 transition-colors group">
            <h3 className="text-sm font-semibold text-zinc-200 mb-1 group-hover:text-yellow-400 transition-colors">Hook Intelligence</h3>
            <p className="text-xs text-zinc-500">Learn from what works — top performing hooks ranked by real engagement data.</p>
          </div>
        </Link>
        <Link href="/admin/alerts" className="block">
          <div className="bg-zinc-900/50 rounded-xl border border-white/[0.08] p-5 hover:border-red-500/30 transition-colors group">
            <h3 className="text-sm font-semibold text-zinc-200 mb-1 group-hover:text-red-400 transition-colors">Alert Center</h3>
            <p className="text-xs text-zinc-500">Proactive alerts when opportunities hit key thresholds. Manage delivery subscriptions.</p>
          </div>
        </Link>
      </div>

      {/* Forecasting Intelligence */}
      {(actNowClusters.length > 0 || risingEarly > 0) && (
        <AdminCard title="Forecasting Intelligence" subtitle="What needs attention right now" accent="emerald">
          <div className="space-y-3">
            {actNowClusters.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                <div>
                  <span className="text-zinc-200 font-medium text-sm">{c.display_name}</span>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] text-emerald-400">Early: {c.earlyness_score}</span>
                    <span className="text-[10px] text-blue-400">Sat: {c.saturation_score}</span>
                    <span className="text-[10px] text-amber-400">Trend: {c.trend_score}</span>
                  </div>
                </div>
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-emerald-400/10 text-emerald-400 border border-emerald-400/30">
                  Act Now
                </span>
              </div>
            ))}
            {risingEarly > 0 && (
              <Link href="/admin/opportunity-radar/trends?recommendation=ACT_NOW" className="block text-xs text-violet-400 hover:text-violet-300 pt-1">
                {risingEarly} early rising product{risingEarly > 1 ? 's' : ''} with low saturation →
              </Link>
            )}
          </div>
        </AdminCard>
      )}

      {/* Hot Opportunities */}
      <AdminCard title="Hot Opportunities" subtitle="Top 5 by score (75+)" accent="emerald" noPadding>
        {loading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : hotOpportunities.length === 0 ? (
          <EmptyState
            title="No hot opportunities"
            description="Add creators to the watchlist and log observations to generate scored opportunities."
            action={
              <Link href="/admin/opportunity-radar/watchlist">
                <AdminButton variant="primary" size="sm">Go to Watchlist</AdminButton>
              </Link>
            }
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
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {hotOpportunities.map((opp) => (
                  <tr key={opp.id} className="border-b border-white/[0.04] even:bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                    <td className="px-4 py-3">
                      <span className={`font-bold tabular-nums ${scoreColor(opp.score)}`}>{opp.score}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-200">{opp.observation?.product_name || '—'}</td>
                    <td className="px-4 py-3 text-zinc-300">@{opp.observation?.creator?.handle || '—'}</td>
                    <td className="px-4 py-3 text-xs text-zinc-400 capitalize">{opp.observation?.confidence || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        opp.status === 'new' ? 'bg-blue-400/10 text-blue-400' :
                        opp.status === 'reviewed' ? 'bg-amber-400/10 text-amber-400' :
                        opp.status === 'actioned' ? 'bg-emerald-400/10 text-emerald-400' :
                        'bg-zinc-400/10 text-zinc-400'
                      }`}>
                        {opp.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </AdminPageLayout>
  );
}
