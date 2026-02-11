'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, TrendingUp, BarChart, Package, Building,
  ArrowUpRight, Video, Percent
} from 'lucide-react';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { SkeletonStats, SkeletonChart } from '@/components/ui/Skeleton';

interface Summary {
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  roi_percent: number;
  total_views: number;
  total_videos: number;
  revenue_per_video: number;
}

interface Breakdown {
  name: string;
  brand?: string;
  handle?: string;
  revenue: number;
  cost: number;
  videos: number;
  views: number;
}

interface TimelinePoint {
  date: string;
  revenue: number;
  cost: number;
  videos: number;
}

interface TopVideo {
  id: string;
  video_code: string;
  product_name: string;
  account_name: string;
  revenue: number;
  cost: number;
  roi: number;
  views: number;
}

function formatMoney(n: number): string {
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatNum(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function HorizontalBar({ items, colorFn }: { items: { name: string; value: number }[]; colorFn: (i: number) => string }) {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={item.name} className="flex items-center gap-3">
          <span className="text-xs text-zinc-400 w-28 truncate">{item.name}</span>
          <div className="flex-1 h-5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${colorFn(i)}`}
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          <span className="text-xs text-zinc-300 w-16 text-right font-medium">{formatMoney(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function RevenuePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byProduct, setByProduct] = useState<Breakdown[]>([]);
  const [byAccount, setByAccount] = useState<Breakdown[]>([]);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [topVideos, setTopVideos] = useState<TopVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/revenue?days=${days}`);
      if (res.ok) {
        const json = await res.json();
        setSummary(json.data?.summary || null);
        setByProduct(json.data?.by_product || []);
        setByAccount(json.data?.by_account || []);
        setTimeline(json.data?.timeline || []);
        setTopVideos(json.data?.top_videos || []);
      }
    } catch (err) {
      console.error('Failed to fetch revenue:', err);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const productColors = ['bg-blue-500', 'bg-teal-500', 'bg-purple-500', 'bg-amber-500', 'bg-pink-500', 'bg-green-500'];
  const accountColors = ['bg-emerald-500', 'bg-violet-500', 'bg-orange-500', 'bg-cyan-500', 'bg-rose-500'];

  // Simple SVG timeline chart
  const maxDailyRev = Math.max(...timeline.map(t => t.revenue), 1);
  const chartWidth = 600;
  const chartHeight = 120;
  const points = timeline.map((t, i) => {
    const x = timeline.length > 1 ? (i / (timeline.length - 1)) * chartWidth : chartWidth / 2;
    const y = chartHeight - (t.revenue / maxDailyRev) * (chartHeight - 10) - 5;
    return `${x},${y}`;
  }).join(' ');

  return (
    <PullToRefresh onRefresh={fetchData}>
      <div className="px-4 py-6 pb-24 lg:pb-8 space-y-5 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Revenue & ROI</h1>
            <p className="text-zinc-400 text-sm">Financial performance of your content</p>
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

        {/* Summary Cards */}
        {loading ? (
          <><SkeletonStats count={4} /><SkeletonChart /></>
        ) : summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-1 text-xs text-zinc-400 mb-1"><DollarSign className="w-3 h-3" /> Total Revenue</div>
              <div className="text-xl font-bold text-green-400">{formatMoney(summary.total_revenue)}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-1 text-xs text-zinc-400 mb-1"><TrendingUp className="w-3 h-3" /> Profit</div>
              <div className={`text-xl font-bold ${summary.total_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatMoney(summary.total_profit)}
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-1 text-xs text-zinc-400 mb-1"><Percent className="w-3 h-3" /> ROI</div>
              <div className={`text-xl font-bold ${summary.roi_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {summary.roi_percent}%
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-1 text-xs text-zinc-400 mb-1"><Video className="w-3 h-3" /> Rev/Video</div>
              <div className="text-xl font-bold text-white">{formatMoney(summary.revenue_per_video)}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{summary.total_videos} videos</div>
            </div>
          </div>
        )}

        {/* Revenue Timeline */}
        {timeline.length > 1 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <BarChart className="w-4 h-4 text-zinc-400" /> Revenue Trend
            </h2>
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-32">
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map(frac => (
                <line
                  key={frac}
                  x1="0" y1={chartHeight - frac * (chartHeight - 10) - 5}
                  x2={chartWidth} y2={chartHeight - frac * (chartHeight - 10) - 5}
                  stroke="#27272a" strokeWidth="1"
                />
              ))}
              {/* Line */}
              <polyline
                fill="none"
                stroke="#14b8a6"
                strokeWidth="2"
                points={points}
              />
              {/* Area fill */}
              <polygon
                fill="url(#revGradient)"
                points={`0,${chartHeight} ${points} ${chartWidth},${chartHeight}`}
              />
              <defs>
                <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
            <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
              <span>{timeline[0]?.date}</span>
              <span>{timeline[timeline.length - 1]?.date}</span>
            </div>
          </div>
        )}

        {/* Breakdowns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* By Product */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Package className="w-4 h-4 text-zinc-400" /> Revenue by Product
            </h2>
            {byProduct.length > 0 ? (
              <HorizontalBar
                items={byProduct.slice(0, 6).map(p => ({ name: p.name, value: p.revenue }))}
                colorFn={(i) => productColors[i % productColors.length]}
              />
            ) : (
              <p className="text-sm text-zinc-500">No product revenue data</p>
            )}
          </div>

          {/* By Account */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Building className="w-4 h-4 text-zinc-400" /> Revenue by Account
            </h2>
            {byAccount.length > 0 ? (
              <HorizontalBar
                items={byAccount.slice(0, 6).map(a => ({ name: a.name, value: a.revenue }))}
                colorFn={(i) => accountColors[i % accountColors.length]}
              />
            ) : (
              <p className="text-sm text-zinc-500">No account revenue data</p>
            )}
          </div>
        </div>

        {/* Top Videos by Revenue */}
        {topVideos.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Top Videos by Revenue</h2>
            <div className="space-y-2">
              {topVideos.map((v, i) => (
                <div key={v.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50">
                  <span className="text-sm font-bold text-zinc-500 w-6">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{v.product_name}</p>
                    <p className="text-xs text-zinc-500">{v.account_name} · {formatNum(v.views)} views</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-green-400">{formatMoney(v.revenue)}</p>
                    {v.roi !== 0 && (
                      <p className={`text-xs flex items-center gap-0.5 justify-end ${v.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        <ArrowUpRight className="w-3 h-3" />{v.roi}% ROI
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
