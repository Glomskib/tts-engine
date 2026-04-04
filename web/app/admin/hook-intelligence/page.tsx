'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import AdminPageLayout, { AdminCard, AdminButton, EmptyState, StatCard } from '../components/AdminPageLayout';
import { SkeletonAuthCheck, SkeletonTable } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';

// ── Types ───────────────────────────────────────────────────────────

interface WinningHook {
  id: string;
  hook_text: string;
  hook_source: string;
  performance_score: number;
  views: number;
  likes: number;
  engagement_rate: number;
  product_name: string | null;
  trend_cluster_id: string | null;
  created_at: string;
}

interface HookStats {
  total: number;
  avg_score: number;
  top_score: number;
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function scoreColor(score: number): string {
  if (score >= 75) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  if (score >= 25) return 'text-blue-400';
  return 'text-zinc-400';
}

const SOURCE_LABELS: Record<string, string> = {
  generated: 'AI Generated',
  manual: 'Manual',
  extracted: 'Extracted',
};

// ── Page ────────────────────────────────────────────────────────────

export default function HookIntelligencePage() {
  const router = useRouter();
  const { showError } = useToast();

  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hooks, setHooks] = useState<WinningHook[]>([]);
  const [stats, setStats] = useState<HookStats>({ total: 0, avg_score: 0, top_score: 0 });

  // Filters
  const [timeWindow, setTimeWindow] = useState<string>('all');
  const [minScore, setMinScore] = useState<string>('');

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) { router.push('/login?redirect=/admin/hook-intelligence'); return; }
        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();
        if (roleData.role !== 'admin') { router.push('/admin/pipeline'); return; }
        setIsAdmin(true);
      } catch {
        router.push('/login?redirect=/admin/hook-intelligence');
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    if (!isAdmin) return;
    const fetchHooks = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (timeWindow !== 'all') params.set('days_back', timeWindow);
        if (minScore) params.set('min_score', minScore);

        const res = await fetch(`/api/admin/hook-intelligence?${params.toString()}`);
        const json = await res.json();
        if (json.ok) {
          setHooks(json.data || []);
          setStats(json.stats || { total: 0, avg_score: 0, top_score: 0 });
        }
      } catch {
        showError('Failed to load hook intelligence');
      } finally {
        setLoading(false);
      }
    };
    fetchHooks();
  }, [isAdmin, timeWindow, minScore, showError]);

  if (authLoading) return <SkeletonAuthCheck />;
  if (!isAdmin) return null;

  return (
    <AdminPageLayout
      title="Hook Intelligence"
      subtitle="Learn from what actually works"
      stage="research"
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Hook Intelligence' },
      ]}
      headerActions={
        <div className="flex items-center gap-2">
          <Link href="/admin/opportunity-feed">
            <AdminButton variant="secondary" size="sm">Opportunity Feed</AdminButton>
          </Link>
        </div>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Winning Hooks" value={loading ? '...' : stats.total} />
        <StatCard label="Avg Score" value={loading ? '...' : stats.avg_score} variant={stats.avg_score >= 50 ? 'success' : 'default'} />
        <StatCard label="Top Score" value={loading ? '...' : stats.top_score} variant="success" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-zinc-900/50 rounded-lg border border-white/[0.08] px-3 py-1.5">
          <span className="text-xs text-zinc-500">Time:</span>
          {[
            { label: 'All', value: 'all' },
            { label: '7d', value: '7' },
            { label: '30d', value: '30' },
            { label: '90d', value: '90' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setTimeWindow(opt.value)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                timeWindow === opt.value
                  ? 'bg-violet-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 bg-zinc-900/50 rounded-lg border border-white/[0.08] px-3 py-1.5">
          <span className="text-xs text-zinc-500">Min Score:</span>
          <input
            type="number"
            value={minScore}
            onChange={e => setMinScore(e.target.value)}
            placeholder="0"
            className="w-12 bg-transparent text-xs text-zinc-200 outline-none"
            min={0}
            max={100}
          />
        </div>
      </div>

      {/* Hooks List */}
      <AdminCard title="Top Performing Hooks" subtitle="Ranked by performance score" accent="emerald" noPadding>
        {loading ? (
          <SkeletonTable rows={8} cols={5} />
        ) : hooks.length === 0 ? (
          <EmptyState
            title="No winning hooks yet"
            description="Hooks are saved automatically when published content performs well. Post more videos to build your hook library."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Score</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Hook</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Product</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Views</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Eng %</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {hooks.map(hook => (
                  <tr key={hook.id} className="border-b border-white/[0.04] even:bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                    <td className="px-4 py-3">
                      <span className={`font-bold tabular-nums ${scoreColor(hook.performance_score)}`}>
                        {hook.performance_score}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-200 max-w-md">
                      <span className="line-clamp-2">&ldquo;{hook.hook_text}&rdquo;</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{hook.product_name || '—'}</td>
                    <td className="px-4 py-3 text-zinc-300 text-xs tabular-nums">{formatViews(hook.views)}</td>
                    <td className="px-4 py-3 text-zinc-300 text-xs tabular-nums">{hook.engagement_rate}%</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                        {SOURCE_LABELS[hook.hook_source] || hook.hook_source}
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
