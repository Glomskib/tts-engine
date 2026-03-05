'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AdminPageLayout, { AdminCard, StatCard } from '../components/AdminPageLayout';
import {
  Loader2, RefreshCw, Video, Scissors, Send, BarChart3,
  ChevronRight, ArrowRight, Eye, Heart, MessageSquare, Share2,
  Sparkles, Clock,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

// --- Types ---

interface QueueItem {
  id: string;
  title: string;
  status: string;
  product_name: string | null;
  created_at: string;
}

interface TopVideo {
  post_id: string;
  content_item_id: string;
  title: string;
  platform: string;
  posted_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

interface DashboardData {
  next_video: QueueItem | null;
  recording_queue: QueueItem[];
  editing_queue: QueueItem[];
  posting_queue: QueueItem[];
  top_video: TopVideo | null;
  stats: Record<string, number>;
}

// --- Helpers ---

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// --- Components ---

function QueueCard({
  item,
  actionLabel,
  actionHref,
}: {
  item: QueueItem;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{item.title}</p>
        <div className="flex items-center gap-2 mt-1">
          {item.product_name && (
            <span className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">{item.product_name}</span>
          )}
          <span className="text-[10px] text-zinc-600 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {timeAgo(item.created_at)}
          </span>
        </div>
      </div>
      {actionHref && (
        <Link
          href={actionHref}
          className="flex-shrink-0 px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-medium bg-teal-600 text-white hover:bg-teal-500 transition-colors flex items-center gap-2"
        >
          {actionLabel}
          <ChevronRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}

function MetricChip({ icon: Icon, value, label }: { icon: typeof Eye; value: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-zinc-400">
      <Icon className="w-3.5 h-3.5" />
      <span className="font-semibold text-zinc-200">{formatNumber(value)}</span>
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

// --- Page ---

export default function CreatorCommandCenter() {
  const { showError } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/creator/dashboard');
      const json = await res.json();
      if (json.ok) setData(json.data);
    } catch {
      showError('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <AdminPageLayout title="Creator Command Center" subtitle="Loading...">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
        </div>
      </AdminPageLayout>
    );
  }

  const stats = data?.stats || {};
  const totalPipeline = (stats.briefing || 0) + (stats.ready_to_record || 0) + (stats.recorded || 0) + (stats.editing || 0) + (stats.ready_to_post || 0);

  return (
    <AdminPageLayout
      title="Creator Command Center"
      subtitle="Your content pipeline at a glance"
      maxWidth="2xl"
      headerActions={
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium bg-zinc-800 text-zinc-100 border border-white/10 hover:bg-zinc-700 rounded-xl transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      }
    >
      {/* Pipeline Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <StatCard label="Briefing" value={stats.briefing || 0} />
        <StatCard label="To Record" value={stats.ready_to_record || 0} variant={stats.ready_to_record > 0 ? 'warning' : 'default'} />
        <StatCard label="Recorded" value={stats.recorded || 0} />
        <StatCard label="Editing" value={stats.editing || 0} />
        <StatCard label="To Post" value={stats.ready_to_post || 0} variant={stats.ready_to_post > 0 ? 'success' : 'default'} />
        <StatCard label="Posted" value={stats.posted || 0} variant="success" />
      </div>

      {/* 1. Next Video — Hero Card */}
      {data?.next_video ? (
        <div className="bg-gradient-to-br from-teal-900/30 to-zinc-900 border border-teal-500/20 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <Video className="w-5 h-5 text-teal-400" />
            <h2 className="text-lg font-semibold text-white">Next Up: Record This</h2>
          </div>
          <p className="text-xl font-bold text-white mb-1">{data.next_video.title}</p>
          {data.next_video.product_name && (
            <p className="text-sm text-zinc-400 mb-4">{data.next_video.product_name}</p>
          )}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={`/admin/video/${data.next_video.id}`}
              className="flex items-center justify-center gap-2 px-6 py-3 min-h-[48px] rounded-xl text-base font-semibold bg-teal-600 text-white hover:bg-teal-500 transition-colors"
            >
              <Video className="w-5 h-5" />
              Record Now
            </Link>
            <Link
              href="/admin/content-studio"
              className="flex items-center justify-center gap-2 px-6 py-3 min-h-[48px] rounded-xl text-sm font-medium bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Generate New Script
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
          <Video className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-zinc-300 mb-1">No Videos Queued</h2>
          <p className="text-sm text-zinc-500 mb-4">Generate a script to get started.</p>
          <Link
            href="/admin/content-studio"
            className="inline-flex items-center gap-2 px-6 py-3 min-h-[48px] rounded-xl text-sm font-semibold bg-teal-600 text-white hover:bg-teal-500 transition-colors"
          >
            <Sparkles className="w-5 h-5" />
            Create Script
          </Link>
        </div>
      )}

      {/* 2. Recording Queue */}
      {data?.recording_queue && data.recording_queue.length > 0 && (
        <AdminCard
          title="Recording Queue"
          subtitle={`${data.recording_queue.length} video${data.recording_queue.length !== 1 ? 's' : ''} ready to record`}
        >
          <div className="space-y-2">
            {data.recording_queue.map(item => (
              <QueueCard
                key={item.id}
                item={item}
                actionLabel="View"
                actionHref={`/admin/video/${item.id}`}
              />
            ))}
          </div>
        </AdminCard>
      )}

      {/* 3. Editing Queue */}
      {data?.editing_queue && data.editing_queue.length > 0 && (
        <AdminCard
          title="Editing Queue"
          subtitle={`${data.editing_queue.length} video${data.editing_queue.length !== 1 ? 's' : ''} need editing`}
        >
          <div className="space-y-2">
            {data.editing_queue.map(item => (
              <QueueCard
                key={item.id}
                item={item}
                actionLabel="Edit"
                actionHref={`/admin/video/${item.id}`}
              />
            ))}
          </div>
        </AdminCard>
      )}

      {/* 4. Posting Queue */}
      {data?.posting_queue && data.posting_queue.length > 0 && (
        <AdminCard
          title="Posting Queue"
          subtitle={`${data.posting_queue.length} video${data.posting_queue.length !== 1 ? 's' : ''} ready to post`}
        >
          <div className="space-y-2">
            {data.posting_queue.map(item => (
              <QueueCard
                key={item.id}
                item={item}
                actionLabel="Post"
                actionHref={`/admin/video/${item.id}`}
              />
            ))}
          </div>
        </AdminCard>
      )}

      {/* 5. Performance Snapshot */}
      <AdminCard title="Performance Snapshot" subtitle="Top video this week">
        {data?.top_video ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{data.top_video.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded uppercase">{data.top_video.platform}</span>
                  <span className="text-[10px] text-zinc-600">{timeAgo(data.top_video.posted_at)}</span>
                </div>
              </div>
              <Link
                href={`/admin/video/${data.top_video.content_item_id}`}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors flex items-center gap-1"
              >
                Details <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <MetricChip icon={Eye} value={data.top_video.views} label="views" />
              <MetricChip icon={Heart} value={data.top_video.likes} label="likes" />
              <MetricChip icon={MessageSquare} value={data.top_video.comments} label="comments" />
              <MetricChip icon={Share2} value={data.top_video.shares} label="shares" />
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500 py-6 text-center">No posted videos this week yet.</p>
        )}
      </AdminCard>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Content Studio', href: '/admin/content-studio', icon: Sparkles },
          { label: 'Content Items', href: '/admin/content-items', icon: Video },
          { label: 'Pipeline', href: '/admin/pipeline', icon: Scissors },
          { label: 'Performance', href: '/admin/performance', icon: BarChart3 },
        ].map(link => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-2 px-4 py-3 min-h-[48px] bg-zinc-900 border border-zinc-800 rounded-xl text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            <link.icon className="w-4 h-4 text-zinc-500" />
            {link.label}
          </Link>
        ))}
      </div>
    </AdminPageLayout>
  );
}
