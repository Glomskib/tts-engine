'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Eye, Heart, MessageCircle, Share2, DollarSign,
  TrendingUp, TrendingDown, ArrowUpDown, Filter,
  ExternalLink, Trophy, RefreshCw, ChevronDown, ChevronUp,
  Search, BarChart
} from 'lucide-react';
import Link from 'next/link';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { PageErrorState } from '@/components/ui/PageErrorState';

interface VideoPerf {
  id: string;
  video_code: string;
  product: { id: string; name: string; brand: string } | null;
  account: { id: string; name: string; handle: string } | null;
  tiktok_url: string | null;
  posted_date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  sales: number;
  revenue: number;
  clicks: number;
  engagement_rate: number;
  tier: 'outperforming' | 'average' | 'underperforming';
  is_winner: boolean;
  winner_score: number | null;
  winner_confidence: string | null;
  stats_updated_at: string | null;
}

interface Summary {
  total: number;
  total_views: number;
  total_revenue: number;
  avg_engagement: number;
  outperforming: number;
  underperforming: number;
}

type SortField = 'posted_date' | 'views' | 'likes' | 'shares' | 'engagement_rate' | 'revenue';

const TIER_STYLES: Record<string, string> = {
  outperforming: 'bg-green-500/10 text-green-400 border-green-500/20',
  average: 'bg-zinc-800/50 text-zinc-300 border-zinc-700',
  underperforming: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const TIER_DOTS: Record<string, string> = {
  outperforming: 'bg-green-400',
  average: 'bg-zinc-500',
  underperforming: 'bg-red-400',
};

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function VideosPage() {
  const [videos, setVideos] = useState<VideoPerf[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('posted_date');
  const [sortAsc, setSortAsc] = useState(false);
  const [filterTier, setFilterTier] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [days, setDays] = useState(30);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/performance?days=${days}&limit=200`);
      if (res.ok) {
        const json = await res.json();
        setVideos(json.data?.videos || []);
        setSummary(json.data?.summary || null);
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Failed to load video performance data');
      }
    } catch (err) {
      console.error('Failed to fetch video performance:', err);
      setError('Failed to load video performance data');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Client-side sort
  const sorted = [...videos].sort((a, b) => {
    const aVal = a[sortField] ?? 0;
    const bVal = b[sortField] ?? 0;
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  // Client-side filter
  const filtered = sorted.filter(v => {
    if (filterTier !== 'all' && v.tier !== filterTier) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        (v.product?.name || '').toLowerCase().includes(q) ||
        (v.account?.name || '').toLowerCase().includes(q) ||
        (v.video_code || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const SortHeader = ({ field, label, className = '' }: { field: SortField; label: string; className?: string }) => (
    <button
      onClick={() => handleSort(field)}
      className={`flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-white transition-colors ${className}`}
    >
      {label}
      {sortField === field ? (
        sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  );

  if (error && !loading) {
    return (
      <PullToRefresh onRefresh={fetchData}>
        <div className="px-4 py-6 pb-24 lg:pb-8 max-w-7xl mx-auto">
          <PageErrorState message={error} onRetry={fetchData} />
        </div>
      </PullToRefresh>
    );
  }

  return (
    <PullToRefresh onRefresh={fetchData}>
      <div className="px-4 py-6 pb-24 lg:pb-8 space-y-5 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Video Performance</h1>
            <p className="text-zinc-400 text-sm">Track and analyze your posted videos</p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="text-xs text-zinc-400 mb-1">Total Videos</div>
              <div className="text-xl font-bold text-white">{summary.total}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="text-xs text-zinc-400 mb-1 flex items-center gap-1"><Eye className="w-3 h-3" /> Total Views</div>
              <div className="text-xl font-bold text-white">{formatNumber(summary.total_views)}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="text-xs text-zinc-400 mb-1 flex items-center gap-1"><BarChart className="w-3 h-3" /> Avg Engagement</div>
              <div className="text-xl font-bold text-white">{summary.avg_engagement}%</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="text-xs text-zinc-400 mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Total Revenue</div>
              <div className="text-xl font-bold text-white">${summary.total_revenue.toLocaleString()}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="text-xs text-zinc-400 mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Outperforming</div>
              <div className="text-xl font-bold text-green-400">{summary.outperforming}</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search product, account, code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:border-teal-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-zinc-500" />
            {['all', 'outperforming', 'average', 'underperforming'].map(tier => (
              <button
                key={tier}
                onClick={() => setFilterTier(tier)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterTier === tier
                    ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white'
                }`}
              >
                {tier === 'all' ? 'All' : tier.charAt(0).toUpperCase() + tier.slice(1)}
              </button>
            ))}
          </div>

          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="hidden lg:grid grid-cols-12 gap-2 px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
            <div className="col-span-3"><SortHeader field="posted_date" label="Video" /></div>
            <div className="col-span-2"><span className="text-xs text-zinc-500">Account</span></div>
            <SortHeader field="views" label="Views" className="col-span-1 justify-end" />
            <SortHeader field="likes" label="Likes" className="col-span-1 justify-end" />
            <SortHeader field="shares" label="Shares" className="col-span-1 justify-end" />
            <SortHeader field="engagement_rate" label="Engage %" className="col-span-1 justify-end" />
            <SortHeader field="revenue" label="Revenue" className="col-span-1 justify-end" />
            <div className="col-span-1"><span className="text-xs text-zinc-500">Status</span></div>
            <div className="col-span-1"></div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-zinc-500 text-sm">Loading performance data...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <BarChart className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">No posted videos found for this period</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {filtered.map((v) => (
                <div key={v.id}>
                  {/* Main row */}
                  <div
                    onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                    className={`grid grid-cols-2 lg:grid-cols-12 gap-2 px-4 py-3 cursor-pointer hover:bg-zinc-800/30 transition-colors items-center ${
                      expandedId === v.id ? 'bg-zinc-800/20' : ''
                    }`}
                  >
                    {/* Video info */}
                    <div className="col-span-2 lg:col-span-3 flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${TIER_DOTS[v.tier]}`} />
                      <div className="min-w-0">
                        <p className="text-sm text-white font-medium truncate">
                          {v.product?.name || v.video_code || 'Untitled'}
                        </p>
                        <p className="text-xs text-zinc-500">{formatDate(v.posted_date)}{v.product?.brand ? ` · ${v.product.brand}` : ''}</p>
                      </div>
                      {v.is_winner && <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    </div>

                    {/* Account - desktop */}
                    <div className="hidden lg:block col-span-2 text-xs text-zinc-400 truncate">
                      {v.account?.name || '-'}
                    </div>

                    {/* Stats */}
                    <div className="hidden lg:flex col-span-1 items-center justify-end gap-1 text-sm text-zinc-300">
                      <Eye className="w-3 h-3 text-zinc-500" />{formatNumber(v.views)}
                    </div>
                    <div className="hidden lg:flex col-span-1 items-center justify-end gap-1 text-sm text-zinc-300">
                      <Heart className="w-3 h-3 text-zinc-500" />{formatNumber(v.likes)}
                    </div>
                    <div className="hidden lg:flex col-span-1 items-center justify-end gap-1 text-sm text-zinc-300">
                      <Share2 className="w-3 h-3 text-zinc-500" />{formatNumber(v.shares)}
                    </div>
                    <div className="hidden lg:flex col-span-1 items-center justify-end text-sm font-medium">
                      <span className={v.engagement_rate >= 5 ? 'text-green-400' : v.engagement_rate >= 2 ? 'text-zinc-300' : 'text-red-400'}>
                        {v.engagement_rate}%
                      </span>
                    </div>
                    <div className="hidden lg:flex col-span-1 items-center justify-end text-sm text-zinc-300">
                      {v.revenue > 0 ? `$${v.revenue.toFixed(0)}` : '-'}
                    </div>

                    {/* Tier badge */}
                    <div className="hidden lg:block col-span-1">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${TIER_STYLES[v.tier]}`}>
                        {v.tier === 'outperforming' ? 'Hot' : v.tier === 'underperforming' ? 'Low' : 'Avg'}
                      </span>
                    </div>

                    {/* Expand */}
                    <div className="hidden lg:flex col-span-1 items-center justify-end">
                      {expandedId === v.id ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                    </div>

                    {/* Mobile stats */}
                    <div className="lg:hidden col-span-2 flex items-center gap-3 text-xs text-zinc-400">
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatNumber(v.views)}</span>
                      <span className={`font-medium ${v.engagement_rate >= 5 ? 'text-green-400' : 'text-zinc-300'}`}>{v.engagement_rate}%</span>
                      {v.revenue > 0 && <span className="text-green-400">${v.revenue.toFixed(0)}</span>}
                      <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] border ${TIER_STYLES[v.tier]}`}>
                        {v.tier === 'outperforming' ? 'Hot' : v.tier === 'underperforming' ? 'Low' : 'Avg'}
                      </span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expandedId === v.id && (
                    <div className="px-4 pb-4 bg-zinc-800/20">
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 py-3">
                        <div><span className="text-[10px] text-zinc-500">Views</span><p className="text-sm text-white font-medium">{v.views.toLocaleString()}</p></div>
                        <div><span className="text-[10px] text-zinc-500">Likes</span><p className="text-sm text-white font-medium">{v.likes.toLocaleString()}</p></div>
                        <div><span className="text-[10px] text-zinc-500">Comments</span><p className="text-sm text-white font-medium">{v.comments.toLocaleString()}</p></div>
                        <div><span className="text-[10px] text-zinc-500">Shares</span><p className="text-sm text-white font-medium">{v.shares.toLocaleString()}</p></div>
                        <div><span className="text-[10px] text-zinc-500">Saves</span><p className="text-sm text-white font-medium">{v.saves.toLocaleString()}</p></div>
                        <div><span className="text-[10px] text-zinc-500">Clicks</span><p className="text-sm text-white font-medium">{v.clicks.toLocaleString()}</p></div>
                        <div><span className="text-[10px] text-zinc-500">Sales</span><p className="text-sm text-white font-medium">{v.sales}</p></div>
                        <div><span className="text-[10px] text-zinc-500">Revenue</span><p className="text-sm text-white font-medium">${v.revenue.toFixed(2)}</p></div>
                        <div><span className="text-[10px] text-zinc-500">Engagement</span><p className="text-sm text-white font-medium">{v.engagement_rate}%</p></div>
                        <div><span className="text-[10px] text-zinc-500">Account</span><p className="text-sm text-white font-medium">{v.account?.name || '-'}</p></div>
                        <div><span className="text-[10px] text-zinc-500">Winner</span><p className="text-sm text-white font-medium">{v.is_winner ? `Yes (${v.winner_confidence}, ${v.winner_score}pts)` : 'No'}</p></div>
                        <div><span className="text-[10px] text-zinc-500">Stats Updated</span><p className="text-sm text-white font-medium">{v.stats_updated_at ? formatDate(v.stats_updated_at) : 'Never'}</p></div>
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-zinc-700/50">
                        {v.tiktok_url && (
                          <a
                            href={v.tiktok_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700/50 rounded-lg text-xs text-zinc-300 hover:text-white transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" /> View on TikTok
                          </a>
                        )}
                        {v.tier === 'outperforming' && (
                          <Link
                            href={`/admin/content-studio${v.product ? `?product=${v.product.id}` : ''}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500/20 text-teal-400 rounded-lg text-xs font-medium hover:bg-teal-500/30 transition-colors"
                          >
                            <TrendingUp className="w-3 h-3" /> Remix Winner
                          </Link>
                        )}
                        <Link
                          href={`/admin/pipeline/${v.id}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700/50 rounded-lg text-xs text-zinc-300 hover:text-white transition-colors"
                        >
                          View in Pipeline
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}
