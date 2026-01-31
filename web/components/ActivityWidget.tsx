'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ActivityItem {
  id: string;
  action: string;
  entity_name: string | null;
  entity_id: string | null;
  created_at: string;
}

const ACTION_ICONS: Record<string, string> = {
  script_generated: 'M13 10V3L4 14h7v7l9-11h-7z',
  script_saved: 'M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2',
  script_edited: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  script_deleted: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  script_favorited: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  script_duplicated: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
};

const ACTION_LABELS: Record<string, string> = {
  script_generated: 'Generated',
  script_saved: 'Saved',
  script_edited: 'Edited',
  script_deleted: 'Deleted',
  script_favorited: 'Favorited',
  script_unfavorited: 'Unfavorited',
  script_exported: 'Exported',
  script_duplicated: 'Duplicated',
  collection_created: 'Created collection',
  template_used: 'Used template',
};

interface ActivityWidgetProps {
  limit?: number;
  className?: string;
}

export default function ActivityWidget({ limit = 5, className = '' }: ActivityWidgetProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivity();
  }, [limit]);

  const fetchActivity = async () => {
    try {
      const res = await fetch(`/api/activity?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        setActivities(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch activity:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  if (loading) {
    return (
      <div className={`p-4 rounded-xl border border-white/10 bg-zinc-900/50 ${className}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-zinc-400">Recent Activity</h3>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-zinc-800" />
              <div className="flex-1">
                <div className="h-3 w-32 bg-zinc-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-xl border border-white/10 bg-zinc-900/50 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-zinc-400">Recent Activity</h3>
        <Link
          href="/admin/activity"
          className="text-xs text-violet-400 hover:text-violet-300"
        >
          View all
        </Link>
      </div>

      {activities.length === 0 ? (
        <div className="text-center py-6 text-zinc-500 text-sm">
          No recent activity
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map(activity => {
            const icon = ACTION_ICONS[activity.action] || 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
            const label = ACTION_LABELS[activity.action] || activity.action;

            return (
              <div key={activity.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-300 truncate">
                    <span className="text-zinc-400">{label}</span>
                    {activity.entity_name && (
                      <span className="text-zinc-500"> · {activity.entity_name}</span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-600">{formatTime(activity.created_at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
