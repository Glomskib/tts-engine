'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, TrendingUp, BarChart, Package, Building,
  ArrowUpRight, Video, Percent, ShoppingCart, Store,
} from 'lucide-react';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { SkeletonStats, SkeletonChart } from '@/components/ui/Skeleton';
import { PageErrorState } from '@/components/ui/PageErrorState';

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

// TikTok Shop types
interface ShopSummary {
  total_gmv: number;
  total_commission: number;
  total_orders: number;
  avg_order_value: number;
  month_orders: number;
  month_gmv: number;
  month_commission: number;
}

interface ShopBrandRevenue {
  id: string;
  name: string;
  gmv: number;
  commission: number;
  orders: number;
}

interface ShopProductRevenue {
  name: string;
  gmv: number;
  commission: number;
  orders: number;
}

interface ShopTimelineEntry {
  week: string;
  gmv: number;
  commission: number;
  orders: number;
}

interface ShopOrder {
  id: string;
  tiktok_order_id: string;
  product_name: string | null;
  order_amount: number;
  commission_amount: number;
  order_status: string | null;
  order_created_at: string | null;
  brand_name: string | null;
  attribution_confidence: number | null;
}

interface ShopData {
  summary: ShopSummary;
  revenue_by_brand: ShopBrandRevenue[];
  revenue_by_product: ShopProductRevenue[];
  timeline: ShopTimelineEntry[];
  recent_orders: ShopOrder[];
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
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  // TikTok Shop data
  const [shopData, setShopData] = useState<ShopData | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, shopRes] = await Promise.all([
        fetch(`/api/revenue?days=${days}`),
        fetch('/api/admin/revenue').catch(() => null),
      ]);
      if (res.ok) {
        const json = await res.json();
        setSummary(json.data?.summary || null);
        setByProduct(json.data?.by_product || []);
        setByAccount(json.data?.by_account || []);
        setTimeline(json.data?.timeline || []);
        setTopVideos(json.data?.top_videos || []);
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Failed to load revenue data');
      }
      // Shop data (optional — don't fail if unavailable)
      if (shopRes?.ok) {
        const shopJson = await shopRes.json().catch(() => ({}));
        if (shopJson.ok && shopJson.data) {
          setShopData(shopJson.data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch revenue:', err);
      setError('Failed to load revenue data');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const productColors = ['bg-teal-500', 'bg-teal-500', 'bg-purple-500', 'bg-amber-500', 'bg-pink-500', 'bg-green-500'];
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
        {/* TikTok Shop Sales Section */}
        {shopData && shopData.summary.total_orders > 0 && (
          <>
            <div className="border-t border-zinc-800 pt-5">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                <Store className="w-5 h-5 text-teal-400" /> TikTok Shop Sales
              </h2>

              {/* Shop Summary */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-1 text-xs text-zinc-400 mb-1"><DollarSign className="w-3 h-3" /> Total GMV</div>
                  <div className="text-xl font-bold text-emerald-400">{formatMoney(shopData.summary.total_gmv)}</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-1 text-xs text-zinc-400 mb-1"><TrendingUp className="w-3 h-3" /> Commission</div>
                  <div className="text-xl font-bold text-teal-400">{formatMoney(shopData.summary.total_commission)}</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-1 text-xs text-zinc-400 mb-1"><ShoppingCart className="w-3 h-3" /> This Month</div>
                  <div className="text-xl font-bold text-blue-400">{shopData.summary.month_orders}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{formatMoney(shopData.summary.month_gmv)}</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-1 text-xs text-zinc-400 mb-1"><Package className="w-3 h-3" /> Avg Order</div>
                  <div className="text-xl font-bold text-amber-400">{formatMoney(shopData.summary.avg_order_value)}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{shopData.summary.total_orders} total</div>
                </div>
              </div>

              {/* Shop Weekly Timeline */}
              {shopData.timeline.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
                  <h3 className="text-sm font-semibold text-white mb-3">Weekly Shop Revenue</h3>
                  <div className="space-y-2">
                    {shopData.timeline.map(entry => {
                      const maxGmv = Math.max(...shopData.timeline.map(e => e.gmv), 1);
                      const pct = (entry.gmv / maxGmv) * 100;
                      const weekDate = new Date(entry.week + 'T12:00:00');
                      const label = weekDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      return (
                        <div key={entry.week} className="flex items-center gap-3">
                          <span className="text-xs text-zinc-500 w-16 shrink-0">{label}</span>
                          <div className="flex-1 h-5 bg-zinc-800 rounded-full overflow-hidden relative">
                            <div
                              className="h-full bg-emerald-500/30 rounded-full transition-all"
                              style={{ width: `${Math.max(pct, 2)}%` }}
                            />
                            <span className="absolute inset-y-0 right-2 flex items-center text-[10px] text-zinc-300 font-medium">
                              {formatMoney(entry.gmv)}
                            </span>
                          </div>
                          <span className="text-[10px] text-zinc-600 w-8 text-right shrink-0">{entry.orders}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Shop Brand + Product */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                {shopData.revenue_by_brand.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                      <Building className="w-4 h-4 text-zinc-400" /> Shop Revenue by Brand
                    </h3>
                    <HorizontalBar
                      items={shopData.revenue_by_brand.slice(0, 6).map(b => ({ name: b.name, value: b.gmv }))}
                      colorFn={(i) => ['bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-green-500', 'bg-lime-500', 'bg-emerald-600'][i % 6]}
                    />
                  </div>
                )}

                {shopData.revenue_by_product.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                      <Package className="w-4 h-4 text-zinc-400" /> Top Shop Products
                    </h3>
                    <HorizontalBar
                      items={shopData.revenue_by_product.slice(0, 6).map(p => ({ name: p.name, value: p.gmv }))}
                      colorFn={(i) => ['bg-teal-500', 'bg-purple-500', 'bg-amber-500', 'bg-pink-500', 'bg-green-500', 'bg-blue-500'][i % 6]}
                    />
                  </div>
                )}
              </div>

              {/* Recent Shop Orders */}
              {shopData.recent_orders.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-white mb-3">Recent Shop Orders</h3>
                  <div className="space-y-2">
                    {shopData.recent_orders.map(order => (
                      <div key={order.id} className="flex items-center gap-3 py-2 border-b border-zinc-800/50 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{order.product_name || 'Unknown Product'}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {order.brand_name && (
                              <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{order.brand_name}</span>
                            )}
                            {order.attribution_confidence != null && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                order.attribution_confidence >= 0.8 ? 'bg-emerald-500/10 text-emerald-400'
                                  : order.attribution_confidence >= 0.5 ? 'bg-amber-500/10 text-amber-400'
                                  : 'bg-zinc-800 text-zinc-500'
                              }`}>
                                {Math.round(order.attribution_confidence * 100)}% match
                              </span>
                            )}
                            {order.order_status && (
                              <span className="text-[10px] text-zinc-600">{order.order_status}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium text-emerald-400">{formatMoney(order.order_amount)}</p>
                          {order.order_created_at && (
                            <p className="text-[10px] text-zinc-600">
                              {new Date(order.order_created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PullToRefresh>
  );
}
