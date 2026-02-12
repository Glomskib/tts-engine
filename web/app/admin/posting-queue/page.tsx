'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Send, Clock, CheckCircle, AlertTriangle, Building,
  Calendar, TrendingUp, Eye, ChevronRight, ExternalLink,
  Filter, RefreshCw
} from 'lucide-react';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { SkeletonVideoList } from '@/components/ui/Skeleton';
import { PageErrorState } from '@/components/ui/PageErrorState';

interface QueueItem {
  id: string;
  type: 'ready' | 'scheduled' | 'posted';
  video_code: string | null;
  product_name: string;
  product_brand: string;
  account_name: string;
  account_handle: string;
  account_id: string | null;
  status: string;
  ready_since?: string;
  scheduled_for?: string | null;
  posted_at?: string;
  posted_url?: string;
  posted_platform?: string;
}

interface Account {
  id: string;
  display_name: string;
  account_code: string;
  platform: string;
  is_active: boolean;
}

interface OptimalTime {
  hour: number;
  label: string;
  avg_views: number;
  avg_engagement: number;
  sample_size: number;
}

interface Conflict {
  key: string;
  count: number;
  warning: string;
}

interface Summary {
  ready_count: number;
  scheduled_count: number;
  recently_posted_count: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatNum(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

const statusConfig: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  ready_to_post: { color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/20', icon: <Clock className="w-3.5 h-3.5" />, label: 'Ready to Post' },
  scheduled: { color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20', icon: <Calendar className="w-3.5 h-3.5" />, label: 'Scheduled' },
  posted: { color: 'text-green-400', bg: 'bg-green-400/10 border-green-400/20', icon: <CheckCircle className="w-3.5 h-3.5" />, label: 'Posted' },
};

export default function PostingQueuePage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [optimalTimes, setOptimalTimes] = useState<OptimalTime[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('');
  const [daysAhead, setDaysAhead] = useState(7);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        days: daysAhead.toString(),
        status: statusFilter,
      });
      if (accountFilter) params.set('account_id', accountFilter);

      const res = await fetch(`/api/posting-queue?${params}`);
      if (res.ok) {
        const json = await res.json();
        setQueue(json.data?.queue || []);
        setSummary(json.data?.summary || null);
        setAccounts(json.data?.accounts || []);
        setOptimalTimes(json.data?.optimal_times || []);
        setConflicts(json.data?.conflicts || []);
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Failed to load posting queue');
      }
    } catch (err) {
      console.error('Failed to fetch posting queue:', err);
      setError('Failed to load posting queue');
    } finally {
      setLoading(false);
    }
  }, [daysAhead, statusFilter, accountFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const readyItems = queue.filter(q => q.type === 'ready');
  const scheduledItems = queue.filter(q => q.type === 'scheduled');
  const postedItems = queue.filter(q => q.type === 'posted');

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
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Posting Queue</h1>
            <p className="text-zinc-400 text-sm">Manage, schedule, and track your content posting</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={daysAhead}
              onChange={(e) => setDaysAhead(parseInt(e.target.value))}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
            >
              <option value={3}>Next 3 days</option>
              <option value={7}>Next 7 days</option>
              <option value={14}>Next 14 days</option>
              <option value={30}>Next 30 days</option>
            </select>
            <button
              onClick={fetchData}
              className="p-2 text-zinc-400 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <div className="flex items-center justify-center gap-1 text-xs text-amber-400 mb-1">
                <Clock className="w-3 h-3" /> Ready
              </div>
              <div className="text-2xl font-bold text-white">{summary.ready_count}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <div className="flex items-center justify-center gap-1 text-xs text-blue-400 mb-1">
                <Calendar className="w-3 h-3" /> Scheduled
              </div>
              <div className="text-2xl font-bold text-white">{summary.scheduled_count}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <div className="flex items-center justify-center gap-1 text-xs text-green-400 mb-1">
                <CheckCircle className="w-3 h-3" /> Posted (3d)
              </div>
              <div className="text-2xl font-bold text-white">{summary.recently_posted_count}</div>
            </div>
          </div>
        )}

        {/* Conflicts */}
        {conflicts.length > 0 && (
          <div className="bg-amber-400/5 border border-amber-400/20 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4" /> Scheduling Conflicts
            </h3>
            <div className="space-y-1">
              {conflicts.map((c, i) => (
                <p key={i} className="text-xs text-amber-300/80">{c.warning}</p>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            <Filter className="w-3 h-3" /> Filters:
          </div>
          <div className="flex gap-1.5">
            {['all', 'ready', 'scheduled', 'posted'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          {accounts.length > 0 && (
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-teal-500 focus:outline-none"
            >
              <option value="">All Accounts</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.display_name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Optimal Posting Times */}
        {optimalTimes.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-zinc-400" /> Best Posting Times
              <span className="text-[10px] text-zinc-500 font-normal">Based on historical performance</span>
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {optimalTimes.map((t, i) => (
                <div
                  key={t.hour}
                  className={`flex-shrink-0 rounded-xl p-3 text-center min-w-[100px] border ${
                    i === 0
                      ? 'bg-teal-500/10 border-teal-500/30'
                      : 'bg-zinc-800/50 border-zinc-700/50'
                  }`}
                >
                  <div className={`text-lg font-bold ${i === 0 ? 'text-teal-400' : 'text-white'}`}>
                    {t.label}
                  </div>
                  <div className="text-xs text-zinc-400 mt-1 flex items-center justify-center gap-1">
                    <Eye className="w-3 h-3" /> {formatNum(t.avg_views)} avg
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    {t.avg_engagement}% eng · {t.sample_size} posts
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ready to Post */}
        {(statusFilter === 'all' || statusFilter === 'ready') && readyItems.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" /> Ready to Post
              <span className="text-xs text-zinc-500 font-normal">({readyItems.length})</span>
            </h2>
            <div className="space-y-2">
              {readyItems.map(item => {
                const cfg = statusConfig[item.status] || statusConfig.ready_to_post;
                return (
                  <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors">
                    <div className={`p-1.5 rounded-lg border ${cfg.bg}`}>
                      <span className={cfg.color}>{cfg.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white truncate">{item.product_name}</p>
                        {item.video_code && (
                          <span className="text-[10px] text-zinc-500 font-mono">{item.video_code}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        {item.account_name && (
                          <span className="flex items-center gap-1">
                            <Building className="w-3 h-3" /> {item.account_name}
                          </span>
                        )}
                        {item.ready_since && (
                          <span>Ready {timeAgo(item.ready_since)}</span>
                        )}
                      </div>
                    </div>
                    <a
                      href={`/admin/pipeline?video=${item.id}`}
                      className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1"
                    >
                      View <ChevronRight className="w-3 h-3" />
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Scheduled */}
        {(statusFilter === 'all' || statusFilter === 'scheduled') && scheduledItems.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" /> Scheduled
              <span className="text-xs text-zinc-500 font-normal">({scheduledItems.length})</span>
            </h2>
            <div className="space-y-2">
              {scheduledItems.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors">
                  <div className="p-1.5 rounded-lg border bg-blue-400/10 border-blue-400/20">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{item.product_name}</p>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      {item.scheduled_for && (
                        <span className="text-blue-400">{formatDateTime(item.scheduled_for)}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recently Posted */}
        {(statusFilter === 'all' || statusFilter === 'posted') && postedItems.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" /> Recently Posted
              <span className="text-xs text-zinc-500 font-normal">({postedItems.length})</span>
            </h2>
            <div className="space-y-2">
              {postedItems.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors">
                  <div className="p-1.5 rounded-lg border bg-green-400/10 border-green-400/20">
                    <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white truncate">{item.product_name}</p>
                      {item.video_code && (
                        <span className="text-[10px] text-zinc-500 font-mono">{item.video_code}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      {item.account_name && (
                        <span className="flex items-center gap-1">
                          <Building className="w-3 h-3" /> {item.account_name}
                        </span>
                      )}
                      {item.posted_at && <span>Posted {timeAgo(item.posted_at)}</span>}
                      {item.posted_platform && (
                        <span className="text-zinc-600 capitalize">{item.posted_platform}</span>
                      )}
                    </div>
                  </div>
                  {item.posted_url && (
                    <a
                      href={item.posted_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && queue.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
            <Send className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">No items in the posting queue</p>
            <p className="text-zinc-600 text-xs mt-1">Videos marked as &quot;Ready to Post&quot; will appear here</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <SkeletonVideoList count={5} />
        )}
      </div>
    </PullToRefresh>
  );
}
