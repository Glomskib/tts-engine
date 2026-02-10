'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart, Eye, Heart, Share2, DollarSign, TrendingUp, Video } from 'lucide-react';

interface ClientStats {
  total_videos: number;
  total_views: number;
  total_likes: number;
  total_shares: number;
  total_revenue: number;
  avg_engagement: number;
  videos_by_status: Record<string, number>;
  top_videos: Array<{
    id: string;
    product_name: string;
    views: number;
    engagement_rate: number;
    revenue: number;
  }>;
}

function formatNum(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

export default function ClientAnalyticsPage() {
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/client/videos?include_stats=true');
      if (res.ok) {
        const json = await res.json();
        const videos = json.data || [];

        // Compute stats client-side
        const totalViews = videos.reduce((s: number, v: any) => s + (v.tiktok_views || v.views_total || 0), 0);
        const totalLikes = videos.reduce((s: number, v: any) => s + (v.tiktok_likes || v.likes_total || 0), 0);
        const totalShares = videos.reduce((s: number, v: any) => s + (v.tiktok_shares || v.shares_total || 0), 0);
        const totalRevenue = videos.reduce((s: number, v: any) => s + (v.tiktok_revenue || v.revenue_total || 0), 0);
        const postedVideos = videos.filter((v: any) => ['POSTED', 'LIVE'].includes(v.recording_status || v.status));
        const avgEng = postedVideos.length > 0
          ? postedVideos.reduce((s: number, v: any) => {
              const views = v.tiktok_views || v.views_total || 0;
              const likes = v.tiktok_likes || v.likes_total || 0;
              const comments = v.tiktok_comments || v.comments_total || 0;
              const shares = v.tiktok_shares || v.shares_total || 0;
              return s + (views > 0 ? ((likes + comments + shares) / views) * 100 : 0);
            }, 0) / postedVideos.length
          : 0;

        const byStatus: Record<string, number> = {};
        for (const v of videos) {
          const st = v.recording_status || v.status || 'UNKNOWN';
          byStatus[st] = (byStatus[st] || 0) + 1;
        }

        const topVids = postedVideos
          .map((v: any) => ({
            id: v.id,
            product_name: v.product?.name || v.video_code || 'Video',
            views: v.tiktok_views || v.views_total || 0,
            engagement_rate: (() => {
              const vi = v.tiktok_views || v.views_total || 0;
              const li = v.tiktok_likes || v.likes_total || 0;
              const co = v.tiktok_comments || v.comments_total || 0;
              const sh = v.tiktok_shares || v.shares_total || 0;
              return vi > 0 ? Math.round(((li + co + sh) / vi) * 10000) / 100 : 0;
            })(),
            revenue: v.tiktok_revenue || v.revenue_total || 0,
          }))
          .sort((a: any, b: any) => b.views - a.views)
          .slice(0, 5);

        setStats({
          total_videos: videos.length,
          total_views: totalViews,
          total_likes: totalLikes,
          total_shares: totalShares,
          total_revenue: totalRevenue,
          avg_engagement: Math.round(avgEng * 100) / 100,
          videos_by_status: byStatus,
          top_videos: topVids,
        });
      }
    } catch (err) {
      console.error('Failed to fetch client analytics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading) {
    return (
      <div className="px-4 py-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Analytics</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 pb-24 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-zinc-400 text-sm">Your content performance metrics</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-1 text-xs text-zinc-400 mb-1"><Video className="w-3 h-3" /> Total Videos</div>
          <div className="text-xl font-bold text-white">{stats?.total_videos || 0}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-1 text-xs text-zinc-400 mb-1"><Eye className="w-3 h-3" /> Total Views</div>
          <div className="text-xl font-bold text-white">{formatNum(stats?.total_views || 0)}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-1 text-xs text-zinc-400 mb-1"><TrendingUp className="w-3 h-3" /> Avg Engagement</div>
          <div className="text-xl font-bold text-white">{stats?.avg_engagement || 0}%</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-1 text-xs text-zinc-400 mb-1"><DollarSign className="w-3 h-3" /> Revenue</div>
          <div className="text-xl font-bold text-white">${(stats?.total_revenue || 0).toLocaleString()}</div>
        </div>
      </div>

      {/* Pipeline Status */}
      {stats && Object.keys(stats.videos_by_status).length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <BarChart className="w-4 h-4 text-zinc-400" /> Videos by Status
          </h2>
          <div className="space-y-2">
            {Object.entries(stats.videos_by_status).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
              <div key={status} className="flex items-center gap-3">
                <span className="text-xs text-zinc-400 w-28 truncate">{status}</span>
                <div className="flex-1 h-4 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full"
                    style={{ width: `${(count / stats.total_videos) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-zinc-300 w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Videos */}
      {stats && stats.top_videos.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Top Performing Videos</h2>
          <div className="space-y-2">
            {stats.top_videos.map((v, i) => (
              <div key={v.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50">
                <span className="text-sm font-bold text-zinc-500 w-6">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{v.product_name}</p>
                </div>
                <span className="text-xs text-zinc-400 flex items-center gap-1"><Eye className="w-3 h-3" />{formatNum(v.views)}</span>
                <span className={`text-xs font-medium ${v.engagement_rate >= 5 ? 'text-green-400' : 'text-zinc-400'}`}>{v.engagement_rate}%</span>
                {v.revenue > 0 && <span className="text-xs text-green-400">${v.revenue.toFixed(0)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
