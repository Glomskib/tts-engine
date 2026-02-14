'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Video,
  ArrowUpDown,
  Calendar,
  ExternalLink,
  ShoppingCart,
  Minus,
} from 'lucide-react';

// ── Types ──

interface Overview {
  total_videos: number;
  posted_videos: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  total_gmv: number;
  total_orders: number;
  avg_engagement: number;
}

interface VideoItem {
  id: string;
  title: string;
  product_name: string | null;
  cover_image_url: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagement_pct: number;
  gmv: number;
  orders: number;
  content_grade: string | null;
  content_tags: string[];
  posted_at: string;
  share_url: string | null;
  duration: number | null;
  status: string;
}

interface ContentBreakdown {
  content_type: string;
  count: number;
  total_views: number;
  avg_views: number;
  total_gmv: number;
}

interface PostingFrequency {
  this_month: number;
  last_month: number;
  posting_days_this_month: string[];
}

interface MonthOverMonth {
  views_change_pct: number;
  engagement_change_pct: number;
  gmv_change_pct: number;
}

interface AnalyticsData {
  overview: Overview;
  videos: VideoItem[];
  content_breakdown: ContentBreakdown[];
  posting_frequency: PostingFrequency;
  month_over_month: MonthOverMonth;
}

type SortKey = 'views' | 'engagement_pct' | 'gmv' | 'posted_at';

// ── Helpers ──

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function formatMoney(n: number): string {
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + 'k';
  return '$' + n.toFixed(0);
}

function TrendBadge({ pct }: { pct: number }) {
  if (pct === 0) return <span className="text-xs text-zinc-500 flex items-center gap-0.5"><Minus className="w-3 h-3" /> 0%</span>;
  const isUp = pct > 0;
  return (
    <span className={`text-xs flex items-center gap-0.5 ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isUp ? '+' : ''}{pct}%
    </span>
  );
}

function GradeBadge({ grade }: { grade: string | null }) {
  if (!grade) return null;
  const colors: Record<string, string> = {
    A: 'bg-emerald-500/20 text-emerald-400',
    B: 'bg-teal-500/20 text-teal-400',
    C: 'bg-amber-500/20 text-amber-400',
    D: 'bg-orange-500/20 text-orange-400',
    F: 'bg-red-500/20 text-red-400',
  };
  return (
    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${colors[grade] || 'bg-zinc-700 text-zinc-400'}`}>
      {grade}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    POSTED: 'bg-emerald-500/20 text-emerald-400',
    LIVE: 'bg-emerald-500/20 text-emerald-400',
    READY_TO_POST: 'bg-teal-500/20 text-teal-400',
    EDITING: 'bg-amber-500/20 text-amber-400',
    RECORDED: 'bg-blue-500/20 text-blue-400',
    NOT_RECORDED: 'bg-zinc-700/50 text-zinc-400',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${colors[status] || 'bg-zinc-700/50 text-zinc-400'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ── Page ──

export default function ClientAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('views');
  const [sortAsc, setSortAsc] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/client/analytics/enhanced', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortedVideos = data?.videos
    ? [...data.videos].sort((a, b) => {
        let diff = 0;
        if (sortKey === 'posted_at') diff = new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime();
        else diff = (b[sortKey] as number) - (a[sortKey] as number);
        return sortAsc ? -diff : diff;
      })
    : [];

  const hasGmv = (data?.overview.total_gmv || 0) > 0;

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="px-4 py-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Analytics</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="mt-6 h-64 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
      </div>
    );
  }

  // ── Empty state ──
  if (!data || data.overview.total_videos === 0) {
    return (
      <div className="px-4 py-6 pb-24 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Analytics</h1>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <Video className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <h2 className="text-lg font-medium text-zinc-200 mb-1">No videos yet</h2>
          <p className="text-sm text-zinc-500 max-w-md mx-auto">
            Your creator hasn&apos;t posted any videos for your brand yet. Once content goes live, you&apos;ll see performance metrics here.
          </p>
        </div>
      </div>
    );
  }

  const { overview, content_breakdown, posting_frequency, month_over_month } = data;

  // Calendar dots for posting days
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const postingDaySet = new Set(posting_frequency.posting_days_this_month);

  return (
    <div className="px-4 py-6 pb-24 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-zinc-400 text-sm">Content performance for your brand</p>
      </div>

      {/* ── Hero Stats ── */}
      <div className={`grid grid-cols-2 ${hasGmv ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3`}>
        <StatCard icon={<Video className="w-3.5 h-3.5" />} label="Total Videos" value={overview.total_videos.toString()} sub={`${overview.posted_videos} posted`} />
        <StatCard icon={<Eye className="w-3.5 h-3.5" />} label="Total Views" value={formatNum(overview.total_views)} trend={<TrendBadge pct={month_over_month.views_change_pct} />} />
        <StatCard icon={<TrendingUp className="w-3.5 h-3.5" />} label="Avg Engagement" value={`${overview.avg_engagement}%`} trend={<TrendBadge pct={month_over_month.engagement_change_pct} />} />
        {hasGmv && (
          <StatCard icon={<DollarSign className="w-3.5 h-3.5" />} label="Total GMV" value={formatMoney(overview.total_gmv)} trend={<TrendBadge pct={month_over_month.gmv_change_pct} />} />
        )}
      </div>

      {/* ── GMV Revenue Card ── */}
      {hasGmv && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-emerald-400" /> Revenue Breakdown
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-zinc-500 mb-0.5">Total GMV</div>
              <div className="text-lg font-bold text-emerald-400">{formatMoney(overview.total_gmv)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-0.5">Orders Driven</div>
              <div className="text-lg font-bold text-white">{overview.total_orders}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-0.5">Avg GMV / Video</div>
              <div className="text-lg font-bold text-white">
                {overview.posted_videos > 0 ? formatMoney(overview.total_gmv / overview.posted_videos) : '$0'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Posting Timeline ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-teal-400" /> Posting Frequency
        </h2>
        <div className="flex items-center gap-6 mb-4">
          <div>
            <span className="text-2xl font-bold text-white">{posting_frequency.this_month}</span>
            <span className="text-sm text-zinc-400 ml-1">this month</span>
          </div>
          <div className="text-zinc-600">vs</div>
          <div>
            <span className="text-2xl font-bold text-zinc-400">{posting_frequency.last_month}</span>
            <span className="text-sm text-zinc-400 ml-1">last month</span>
          </div>
        </div>
        {/* Calendar dots */}
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isPosted = postingDaySet.has(dateStr);
            const isFuture = day > today.getDate();
            return (
              <div
                key={day}
                title={`Day ${day}${isPosted ? ' — posted' : ''}`}
                className={`w-6 h-6 rounded text-[10px] font-medium flex items-center justify-center ${
                  isPosted
                    ? 'bg-teal-500/30 text-teal-300 ring-1 ring-teal-500/40'
                    : isFuture
                      ? 'bg-zinc-800/30 text-zinc-600'
                      : 'bg-zinc-800/60 text-zinc-500'
                }`}
              >
                {day}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Content Type Breakdown ── */}
      {content_breakdown.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-zinc-400" /> Content Type Breakdown
          </h2>
          <div className="space-y-2">
            {content_breakdown.map(ct => {
              const maxViews = content_breakdown[0]?.total_views || 1;
              return (
                <div key={ct.content_type} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 w-28 truncate capitalize">{ct.content_type}</span>
                  <div className="flex-1 h-5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-500/70 rounded-full flex items-center px-2"
                      style={{ width: `${Math.max(5, (ct.total_views / maxViews) * 100)}%` }}
                    >
                      <span className="text-[10px] text-white font-medium truncate">{formatNum(ct.total_views)} views</span>
                    </div>
                  </div>
                  <span className="text-xs text-zinc-500 w-16 text-right">{ct.count} videos</span>
                  {ct.total_gmv > 0 && (
                    <span className="text-xs text-emerald-400 w-16 text-right">{formatMoney(ct.total_gmv)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Video Performance Table ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-white">Video Performance</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{sortedVideos.length} videos — click headers to sort</p>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-zinc-500 uppercase border-b border-zinc-800/50">
                <th className="text-left px-4 py-2.5">Video</th>
                <th className="text-left px-3 py-2.5">Status</th>
                <th className="text-right px-3 py-2.5 cursor-pointer hover:text-zinc-300 select-none" onClick={() => handleSort('views')}>
                  <span className="inline-flex items-center gap-1">Views <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                <th className="text-right px-3 py-2.5 cursor-pointer hover:text-zinc-300 select-none" onClick={() => handleSort('engagement_pct')}>
                  <span className="inline-flex items-center gap-1">Eng % <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                {hasGmv && (
                  <th className="text-right px-3 py-2.5 cursor-pointer hover:text-zinc-300 select-none" onClick={() => handleSort('gmv')}>
                    <span className="inline-flex items-center gap-1">GMV <ArrowUpDown className="w-3 h-3" /></span>
                  </th>
                )}
                <th className="text-left px-3 py-2.5">Grade</th>
                <th className="text-right px-3 py-2.5 cursor-pointer hover:text-zinc-300 select-none" onClick={() => handleSort('posted_at')}>
                  <span className="inline-flex items-center gap-1">Date <ArrowUpDown className="w-3 h-3" /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedVideos.map(v => (
                <tr key={v.id} className="border-t border-zinc-800/30 hover:bg-zinc-800/30">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      {v.cover_image_url ? (
                        <img src={v.cover_image_url} alt="" className="w-10 h-10 rounded object-cover bg-zinc-800 shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-zinc-800 shrink-0 flex items-center justify-center">
                          <Video className="w-4 h-4 text-zinc-600" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-200 truncate max-w-[200px]">{v.title}</p>
                        {v.product_name && <p className="text-xs text-zinc-500 truncate">{v.product_name}</p>}
                      </div>
                      {v.share_url && (
                        <a href={v.share_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-zinc-600 hover:text-teal-400">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge status={v.status} /></td>
                  <td className="px-3 py-2.5 text-right text-zinc-300 tabular-nums">{formatNum(v.views)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${v.engagement_pct >= 5 ? 'text-emerald-400' : v.engagement_pct >= 2 ? 'text-teal-400' : 'text-zinc-400'}`}>
                    {v.engagement_pct}%
                  </td>
                  {hasGmv && (
                    <td className="px-3 py-2.5 text-right text-zinc-300 tabular-nums">
                      {v.gmv > 0 ? formatMoney(v.gmv) : <span className="text-zinc-600">—</span>}
                    </td>
                  )}
                  <td className="px-3 py-2.5"><GradeBadge grade={v.content_grade} /></td>
                  <td className="px-3 py-2.5 text-right text-xs text-zinc-500 tabular-nums">{new Date(v.posted_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-zinc-800/50">
          {sortedVideos.map(v => (
            <div key={v.id} className="p-4 space-y-2">
              <div className="flex items-start gap-3">
                {v.cover_image_url ? (
                  <img src={v.cover_image_url} alt="" className="w-12 h-12 rounded object-cover bg-zinc-800 shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded bg-zinc-800 shrink-0 flex items-center justify-center">
                    <Video className="w-5 h-5 text-zinc-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-zinc-200 truncate">{v.title}</p>
                    <GradeBadge grade={v.content_grade} />
                  </div>
                  <p className="text-xs text-zinc-500">{new Date(v.posted_at).toLocaleDateString()} · <StatusBadge status={v.status} /></p>
                </div>
                {v.share_url && (
                  <a href={v.share_url} target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-teal-400 shrink-0">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-zinc-400 flex items-center gap-1"><Eye className="w-3 h-3" />{formatNum(v.views)}</span>
                <span className="text-zinc-400 flex items-center gap-1"><Heart className="w-3 h-3" />{formatNum(v.likes)}</span>
                <span className="text-zinc-400 flex items-center gap-1"><MessageCircle className="w-3 h-3" />{formatNum(v.comments)}</span>
                <span className="text-zinc-400 flex items-center gap-1"><Share2 className="w-3 h-3" />{formatNum(v.shares)}</span>
                <span className={`ml-auto font-medium ${v.engagement_pct >= 5 ? 'text-emerald-400' : 'text-zinc-400'}`}>{v.engagement_pct}%</span>
                {v.gmv > 0 && <span className="text-emerald-400">{formatMoney(v.gmv)}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Top Videos by GMV ── */}
      {hasGmv && (() => {
        const topGmv = [...data.videos].filter(v => v.gmv > 0).sort((a, b) => b.gmv - a.gmv).slice(0, 5);
        if (topGmv.length === 0) return null;
        return (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" /> Top Videos by GMV
            </h2>
            <div className="space-y-2">
              {topGmv.map((v, i) => (
                <div key={v.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50">
                  <span className="text-sm font-bold text-zinc-500 w-6">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{v.title}</p>
                  </div>
                  <span className="text-xs text-zinc-400">{formatNum(v.views)} views</span>
                  <span className="text-sm font-medium text-emerald-400">{formatMoney(v.gmv)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Sub-components ──

function StatCard({
  icon,
  label,
  value,
  sub,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  trend?: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1">
        {icon}
        {label}
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="flex items-center gap-2 mt-0.5">
        {sub && <span className="text-xs text-zinc-500">{sub}</span>}
        {trend}
      </div>
    </div>
  );
}
