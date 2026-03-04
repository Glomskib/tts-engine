'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Trophy, Zap, Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import AdminPageLayout, { AdminCard, StatCard, EmptyState } from '@/app/admin/components/AdminPageLayout';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────

interface DashboardData {
  stats: {
    total_posts: number;
    total_views: number;
    total_likes: number;
    overall_engagement: number;
  };
  top_posts: Array<{
    id: string;
    platform: string;
    post_url: string;
    posted_at: string | null;
    performance_score: string | null;
    views: number;
    engagement_rate: number;
  }>;
  hook_patterns: Array<{
    pattern: string;
    example_hook: string | null;
    performance_score: number;
    uses_count: number;
  }>;
  views_over_time: Array<{ date: string; views: number }>;
  platform_breakdown: Array<{ platform: string; views: number; posts: number }>;
  product_performance: Array<{
    name: string;
    posts: number;
    total_views: number;
    avg_engagement_rate: number;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: '#00f2ea',
  instagram: '#e1306c',
  youtube: '#ff0000',
  facebook: '#1877f2',
  other: '#71717a',
};

const SCORE_STYLES: Record<string, { bg: string; text: string }> = {
  'A+': { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  'A':  { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  'B':  { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  'C':  { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  'D':  { bg: 'bg-red-500/20', text: 'text-red-400' },
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function ScoreBadge({ grade }: { grade: string }) {
  const style = SCORE_STYLES[grade] || SCORE_STYLES.D;
  return (
    <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-bold ${style.bg} ${style.text}`}>
      {grade}
    </span>
  );
}

function PlatformDot({ platform }: { platform: string }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full"
      style={{ backgroundColor: PLATFORM_COLORS[platform] || PLATFORM_COLORS.other }}
    />
  );
}

const chartTooltipStyle = {
  backgroundColor: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: '8px',
  fontSize: '12px',
};

// ─── Page Component ───────────────────────────────────────────

export default function PerformanceDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/performance');
      const json = await res.json();
      if (json.ok) setData(json.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return (
      <AdminPageLayout title="Performance">
        <div className="flex items-center justify-center py-24">
          <Loader2 size={32} className="animate-spin text-zinc-500" />
        </div>
      </AdminPageLayout>
    );
  }

  if (!data) {
    return (
      <AdminPageLayout title="Performance">
        <EmptyState
          icon={<BarChart3 size={24} />}
          title="No data available"
          description="Start posting content and adding metrics to see your performance dashboard."
        />
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="Performance"
      subtitle="Content performance overview"
      maxWidth="2xl"
      headerActions={
        <button
          type="button"
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50 text-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      }
    >
      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Posts" value={data.stats.total_posts} />
        <StatCard label="Total Views" value={formatNum(data.stats.total_views)} />
        <StatCard label="Total Likes" value={formatNum(data.stats.total_likes)} />
        <StatCard
          label="Engagement Rate"
          value={`${data.stats.overall_engagement}%`}
          variant={data.stats.overall_engagement > 5 ? 'success' : data.stats.overall_engagement > 3 ? 'warning' : 'default'}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Views Over Time — spans 2 cols */}
        <div className="lg:col-span-2">
          <AdminCard title="Views Over Time" subtitle="Last 30 days">
            {data.views_over_time.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.views_over_time} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#71717a', fontSize: 10 }}
                      axisLine={{ stroke: '#3f3f46' }}
                      tickLine={false}
                      tickFormatter={(d: string) => {
                        const dt = new Date(d + 'T00:00:00');
                        return `${dt.getMonth() + 1}/${dt.getDate()}`;
                      }}
                    />
                    <YAxis
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      tickFormatter={formatNum}
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      labelStyle={{ color: '#a1a1aa' }}
                      formatter={(value: number | undefined) => [formatNum(value ?? 0), 'Views']}
                    />
                    <Line
                      type="monotone"
                      dataKey="views"
                      stroke="#2dd4bf"
                      strokeWidth={2}
                      dot={{ r: 2, fill: '#2dd4bf' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-zinc-500 py-8 text-center">No data yet</p>
            )}
          </AdminCard>
        </div>

        {/* Platform Breakdown */}
        <AdminCard title="Platform Breakdown">
          {data.platform_breakdown.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.platform_breakdown} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="platform"
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    axisLine={{ stroke: '#3f3f46' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    tickFormatter={formatNum}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={{ color: '#a1a1aa' }}
                    formatter={(value: number | undefined) => [formatNum(value ?? 0), 'Views']}
                  />
                  <Bar dataKey="views" radius={[4, 4, 0, 0]}>
                    {data.platform_breakdown.map((entry, i) => (
                      <Cell key={i} fill={PLATFORM_COLORS[entry.platform] || PLATFORM_COLORS.other} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-zinc-500 py-8 text-center">No data yet</p>
          )}
        </AdminCard>
      </div>

      {/* Content Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Performing Posts */}
        <AdminCard title="Top Performing Posts" subtitle="Ranked by engagement rate">
          {data.top_posts.length > 0 ? (
            <div className="space-y-2">
              {data.top_posts.map((post, i) => (
                <div key={post.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  <span className="text-xs font-mono text-zinc-600 w-5">{i + 1}</span>
                  <PlatformDot platform={post.platform} />
                  {post.performance_score && <ScoreBadge grade={post.performance_score} />}
                  <div className="flex-1 min-w-0">
                    <a
                      href={post.post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-zinc-300 hover:text-teal-400 truncate flex items-center gap-1"
                    >
                      <ExternalLink size={10} className="flex-shrink-0" />
                      <span className="truncate">{post.post_url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 35)}</span>
                    </a>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-medium text-zinc-200">{formatNum(post.views)}</div>
                    <div className="text-[10px] text-zinc-500">{post.engagement_rate}%</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500 py-8 text-center">No posts with metrics yet</p>
          )}
        </AdminCard>

        {/* Winning Hooks */}
        <AdminCard title="Winning Hooks" subtitle="Top hook patterns by performance">
          {data.hook_patterns.length > 0 ? (
            <div className="space-y-3">
              {data.hook_patterns.map((hook, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-yellow-500/10 flex-shrink-0">
                    <Zap size={14} className="text-yellow-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-200">{hook.pattern}</div>
                    {hook.example_hook && (
                      <div className="text-xs text-zinc-500 mt-0.5 italic truncate">{hook.example_hook}</div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-medium text-yellow-400">{hook.performance_score}/10</div>
                    <div className="text-[10px] text-zinc-500">{hook.uses_count} uses</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Trophy size={20} />}
              title="No hook patterns yet"
              description="Hook patterns are extracted when you run AI postmortems on posts with strong hooks."
            />
          )}
        </AdminCard>
      </div>

      {/* Product Performance */}
      {data.product_performance.length > 0 && (
        <AdminCard title="Product Performance" subtitle="Average engagement rate by product">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider">
                  <th className="pb-3 font-medium">Product</th>
                  <th className="pb-3 font-medium text-right">Posts</th>
                  <th className="pb-3 font-medium text-right">Views</th>
                  <th className="pb-3 font-medium text-right">Avg Engagement</th>
                </tr>
              </thead>
              <tbody>
                {data.product_performance.map((prod, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="py-2.5 text-zinc-200 font-medium">{prod.name}</td>
                    <td className="py-2.5 text-right text-zinc-400">{prod.posts}</td>
                    <td className="py-2.5 text-right text-zinc-400">{formatNum(prod.total_views)}</td>
                    <td className="py-2.5 text-right">
                      <span className={`font-medium ${
                        prod.avg_engagement_rate > 8 ? 'text-emerald-400' :
                        prod.avg_engagement_rate > 5 ? 'text-blue-400' :
                        prod.avg_engagement_rate > 3 ? 'text-amber-400' : 'text-zinc-400'
                      }`}>
                        {prod.avg_engagement_rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCard>
      )}
    </AdminPageLayout>
  );
}
