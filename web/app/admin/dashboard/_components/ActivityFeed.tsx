'use client';

import { Activity, Video, FileText, AlertCircle, Send, Clock } from 'lucide-react';

interface FeedItem {
  id: string;
  type: 'pipeline' | 'user';
  event: string;
  description: string;
  timestamp: string;
}

function getEventIcon(item: FeedItem) {
  if (item.type === 'pipeline') {
    if (item.event === 'error') return <AlertCircle className="w-4 h-4 text-red-400" />;
    if (item.event === 'status_change') return <Video className="w-4 h-4 text-blue-400" />;
    return <Activity className="w-4 h-4 text-zinc-400" />;
  }
  if (item.event?.includes('script')) return <FileText className="w-4 h-4 text-purple-400" />;
  if (item.event?.includes('post')) return <Send className="w-4 h-4 text-teal-400" />;
  return <Activity className="w-4 h-4 text-zinc-400" />;
}

function timeAgo(timestamp: string): string {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ActivityFeed({ items, loading }: { items: FeedItem[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-teal-400" />
          Activity Feed
        </h2>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 bg-[var(--surface2)] rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
      <h2 className="text-lg font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
        <Activity className="w-5 h-5 text-teal-400" />
        Activity Feed
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No recent activity</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-start gap-3 py-2 px-2 rounded-lg hover:bg-[var(--surface2)] transition-colors">
              <div className="mt-0.5 flex-shrink-0">{getEventIcon(item)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text)] truncate">{item.description}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">{timeAgo(item.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
