'use client';

import { useState, useEffect } from 'react';
import { useCredits } from '@/hooks/useCredits';
import { SkeletonStats, SkeletonChart } from '@/components/ui/Skeleton';

interface UsageStats {
  scriptsGenerated: number;
  scriptsThisWeek: number;
  scriptsThisMonth: number;
  averageScore: number;
  topPersonas: Array<{ name: string; count: number }>;
  topProducts: Array<{ name: string; count: number }>;
  dailyUsage: Array<{ date: string; count: number }>;
}

const DATE_RANGES = [
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
];

export default function UsagePage() {
  const { credits, subscription } = useCredits();
  const [dateRange, setDateRange] = useState('30d');
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsageStats();
  }, [dateRange]);

  const fetchUsageStats = async () => {
    setLoading(true);
    try {
      // Fetch scripts for stats
      const res = await fetch('/api/skits?limit=100');
      if (res.ok) {
        const data = await res.json();
        const scripts = data.data || [];

        // Calculate date range
        const now = new Date();
        const daysBack = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
        const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Filter scripts in range
        const scriptsInRange = scripts.filter((s: { created_at: string }) =>
          new Date(s.created_at) >= startDate
        );

        // Calculate stats
        const scriptsThisWeek = scripts.filter((s: { created_at: string }) =>
          new Date(s.created_at) >= weekAgo
        ).length;

        const scriptsThisMonth = scripts.filter((s: { created_at: string }) =>
          new Date(s.created_at) >= monthAgo
        ).length;

        // Calculate average score
        const scoresArray = scriptsInRange
          .filter((s: { ai_score?: { overall_score?: number } }) => s.ai_score?.overall_score)
          .map((s: { ai_score: { overall_score: number } }) => s.ai_score.overall_score);
        const avgScore = scoresArray.length > 0
          ? scoresArray.reduce((a: number, b: number) => a + b, 0) / scoresArray.length
          : 0;

        // Top personas (from generation config)
        const personaCounts: Record<string, number> = {};
        scriptsInRange.forEach((s: { generation_config?: { persona?: string } }) => {
          const persona = s.generation_config?.persona || 'Default';
          personaCounts[persona] = (personaCounts[persona] || 0) + 1;
        });
        const topPersonas = Object.entries(personaCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, count]) => ({ name, count }));

        // Top products
        const productCounts: Record<string, number> = {};
        scriptsInRange.forEach((s: { product_name?: string }) => {
          const product = s.product_name || 'Unnamed';
          productCounts[product] = (productCounts[product] || 0) + 1;
        });
        const topProducts = Object.entries(productCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, count]) => ({ name, count }));

        // Daily usage
        const dailyCounts: Record<string, number> = {};
        scriptsInRange.forEach((s: { created_at: string }) => {
          const date = new Date(s.created_at).toISOString().split('T')[0];
          dailyCounts[date] = (dailyCounts[date] || 0) + 1;
        });

        // Fill in missing days
        const dailyUsage: Array<{ date: string; count: number }> = [];
        for (let i = daysBack - 1; i >= 0; i--) {
          const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const dateStr = date.toISOString().split('T')[0];
          dailyUsage.push({ date: dateStr, count: dailyCounts[dateStr] || 0 });
        }

        setStats({
          scriptsGenerated: scriptsInRange.length,
          scriptsThisWeek,
          scriptsThisMonth,
          averageScore: Math.round(avgScore * 10) / 10,
          topPersonas,
          topProducts,
          dailyUsage,
        });
      }
    } catch (err) {
      console.error('Failed to fetch usage stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const maxDailyCount = stats?.dailyUsage.reduce((max, d) => Math.max(max, d.count), 0) || 1;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto pb-24 lg:pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">Usage Analytics</h1>
            <p className="text-zinc-400">Track your script generation activity</p>
          </div>

          {/* Date Range Selector */}
          <div className="flex gap-2">
            {DATE_RANGES.map(range => (
              <button type="button"
                key={range.id}
                onClick={() => setDateRange(range.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  dateRange === range.id
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            <SkeletonStats count={4} />
            <SkeletonChart />
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="p-5 rounded-xl border border-white/10 bg-zinc-900/50">
                <div className="text-sm text-zinc-400 mb-1">Scripts Generated</div>
                <div className="text-2xl font-bold text-white">{stats?.scriptsGenerated || 0}</div>
                <div className="text-xs text-zinc-500 mt-1">in selected period</div>
              </div>

              <div className="p-5 rounded-xl border border-white/10 bg-zinc-900/50">
                <div className="text-sm text-zinc-400 mb-1">This Week</div>
                <div className="text-2xl font-bold text-white">{stats?.scriptsThisWeek || 0}</div>
                <div className="text-xs text-zinc-500 mt-1">last 7 days</div>
              </div>

              <div className="p-5 rounded-xl border border-white/10 bg-zinc-900/50">
                <div className="text-sm text-zinc-400 mb-1">Avg. Score</div>
                <div className="text-2xl font-bold text-white">{stats?.averageScore || '-'}/10</div>
                <div className="text-xs text-zinc-500 mt-1">AI quality rating</div>
              </div>

              <div className="p-5 rounded-xl border border-white/10 bg-zinc-900/50">
                <div className="text-sm text-zinc-400 mb-1">Credits Remaining</div>
                <div className="text-2xl font-bold text-emerald-400">
                  {credits?.remaining === -1 ? '∞' : credits?.remaining ?? 0}
                </div>
                <div className="text-xs text-zinc-500 mt-1">{subscription?.planName || 'Free'} plan</div>
              </div>
            </div>

            {/* Usage Chart */}
            <div className="mb-8 p-6 rounded-xl border border-white/10 bg-zinc-900/50">
              <h2 className="text-lg font-semibold text-white mb-4">Daily Activity</h2>

              {stats?.dailyUsage && stats.dailyUsage.length > 0 ? (
                <div className="h-48 flex items-end gap-1">
                  {stats.dailyUsage.map((day) => {
                    const height = maxDailyCount > 0 ? (day.count / maxDailyCount) * 100 : 0;
                    return (
                      <div
                        key={day.date}
                        className="flex-1 group relative"
                        title={`${day.date}: ${day.count} scripts`}
                      >
                        <div
                          className="w-full bg-violet-500/80 rounded-t transition-all hover:bg-violet-400"
                          style={{ height: `${Math.max(height, day.count > 0 ? 4 : 0)}%` }}
                        />
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-800 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                          {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: {day.count}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-zinc-500">
                  No activity data available
                </div>
              )}

              {/* X-axis labels */}
              <div className="flex justify-between mt-2 text-xs text-zinc-500">
                <span>{stats?.dailyUsage[0]?.date ? new Date(stats.dailyUsage[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                <span>{stats?.dailyUsage[stats.dailyUsage.length - 1]?.date ? new Date(stats.dailyUsage[stats.dailyUsage.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
              </div>
            </div>

            {/* Top Lists */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Top Products */}
              <div className="p-6 rounded-xl border border-white/10 bg-zinc-900/50">
                <h2 className="text-lg font-semibold text-white mb-4">Top Products</h2>
                {stats?.topProducts && stats.topProducts.length > 0 ? (
                  <div className="space-y-3">
                    {stats.topProducts.map((product, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-400 text-xs flex items-center justify-center">
                            {i + 1}
                          </span>
                          <span className="text-zinc-300">{product.name}</span>
                        </div>
                        <span className="text-zinc-500">{product.count} scripts</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-zinc-500">No product data</div>
                )}
              </div>

              {/* Top Personas */}
              <div className="p-6 rounded-xl border border-white/10 bg-zinc-900/50">
                <h2 className="text-lg font-semibold text-white mb-4">Most Used Personas</h2>
                {stats?.topPersonas && stats.topPersonas.length > 0 ? (
                  <div className="space-y-3">
                    {stats.topPersonas.map((persona, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-400 text-xs flex items-center justify-center">
                            {i + 1}
                          </span>
                          <span className="text-zinc-300">{persona.name}</span>
                        </div>
                        <span className="text-zinc-500">{persona.count} uses</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-zinc-500">No persona data</div>
                )}
              </div>
            </div>
          </>
        )}
    </div>
  );
}
