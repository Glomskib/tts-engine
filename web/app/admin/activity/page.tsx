'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AppLayout from '../../components/AppLayout';

interface ActivityItem {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const ACTION_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  script_generated: {
    label: 'Generated script',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
    color: 'text-violet-400',
  },
  script_saved: {
    label: 'Saved script',
    icon: 'M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2',
    color: 'text-emerald-400',
  },
  script_edited: {
    label: 'Edited script',
    icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
    color: 'text-blue-400',
  },
  script_deleted: {
    label: 'Deleted script',
    icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
    color: 'text-red-400',
  },
  script_favorited: {
    label: 'Added to favorites',
    icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
    color: 'text-pink-400',
  },
  script_unfavorited: {
    label: 'Removed from favorites',
    icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
    color: 'text-zinc-400',
  },
  script_exported: {
    label: 'Exported script',
    icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
    color: 'text-cyan-400',
  },
  script_duplicated: {
    label: 'Duplicated script',
    icon: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
    color: 'text-amber-400',
  },
  collection_created: {
    label: 'Created collection',
    icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
    color: 'text-indigo-400',
  },
  collection_deleted: {
    label: 'Deleted collection',
    icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
    color: 'text-red-400',
  },
  template_used: {
    label: 'Used template',
    icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z',
    color: 'text-orange-400',
  },
  version_restored: {
    label: 'Restored version',
    icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
    color: 'text-teal-400',
  },
};

const ACTION_FILTERS = [
  { value: '', label: 'All Actions' },
  { value: 'script_generated', label: 'Generated' },
  { value: 'script_saved', label: 'Saved' },
  { value: 'script_edited', label: 'Edited' },
  { value: 'script_deleted', label: 'Deleted' },
  { value: 'script_favorited', label: 'Favorited' },
  { value: 'script_exported', label: 'Exported' },
  { value: 'script_duplicated', label: 'Duplicated' },
  { value: 'collection_created', label: 'Collection Created' },
  { value: 'template_used', label: 'Template Used' },
];

const DATE_RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'all', label: 'All Time' },
];

export default function ActivityPage() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [dateRange, setDateRange] = useState('month');
  const [search, setSearch] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const limit = 30;

  const getDateRange = useCallback(() => {
    const now = new Date();
    let dateFrom: string | null = null;

    switch (dateRange) {
      case 'today':
        dateFrom = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        break;
      case 'week':
        dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case 'month':
        dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        break;
      default:
        dateFrom = null;
    }

    return dateFrom;
  }, [dateRange]);

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', limit.toString());
      params.set('offset', (page * limit).toString());

      if (actionFilter) params.set('action', actionFilter);
      if (search) params.set('search', search);

      const dateFrom = getDateRange();
      if (dateFrom) params.set('date_from', dateFrom);

      const res = await fetch(`/api/activity?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setActivities(data.data || []);
        setTotalCount(data.meta?.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch activity:', err);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, dateRange, search, page, getDateRange]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // Less than a minute
    if (diff < 60000) return 'Just now';

    // Less than an hour
    if (diff < 3600000) {
      const mins = Math.floor(diff / 60000);
      return `${mins}m ago`;
    }

    // Less than a day
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }

    // Less than a week
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days}d ago`;
    }

    // Otherwise, show date
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const groupByDate = (items: ActivityItem[]) => {
    const groups: Record<string, ActivityItem[]> = {};

    items.forEach(item => {
      const date = new Date(item.created_at);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let key: string;
      if (date.toDateString() === today.toDateString()) {
        key = 'Today';
      } else if (date.toDateString() === yesterday.toDateString()) {
        key = 'Yesterday';
      } else {
        key = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      }

      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    return groups;
  };

  const groupedActivities = groupByDate(activities);

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Activity</h1>
          <p className="text-zinc-400">Your recent actions and script history</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search by script name..."
              className="w-full px-4 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* Action Filter */}
          <select
            value={actionFilter}
            onChange={e => {
              setActionFilter(e.target.value);
              setPage(0);
            }}
            className="px-4 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {ACTION_FILTERS.map(filter => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>

          {/* Date Range */}
          <select
            value={dateRange}
            onChange={e => {
              setDateRange(e.target.value);
              setPage(0);
            }}
            className="px-4 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {DATE_RANGES.map(range => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>
        </div>

        {/* Activity Timeline */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-zinc-800" />
                <div className="flex-1">
                  <div className="h-4 w-48 bg-zinc-800 rounded mb-2" />
                  <div className="h-3 w-24 bg-zinc-800 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-16">
            <svg className="w-16 h-16 mx-auto text-zinc-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-medium text-zinc-400 mb-2">No activity yet</h3>
            <p className="text-zinc-500">
              {search || actionFilter ? 'Try adjusting your filters' : 'Start creating scripts to see your activity here'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedActivities).map(([dateLabel, items]) => (
              <div key={dateLabel}>
                <h3 className="text-sm font-medium text-zinc-500 mb-4">{dateLabel}</h3>
                <div className="space-y-1">
                  {items.map((activity, idx) => {
                    const config = ACTION_CONFIG[activity.action] || {
                      label: activity.action,
                      icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
                      color: 'text-zinc-400',
                    };

                    return (
                      <div
                        key={activity.id}
                        className="flex items-start gap-4 p-3 rounded-lg hover:bg-zinc-800/50 transition-colors group"
                      >
                        {/* Icon */}
                        <div className={`w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0 ${config.color}`}>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={config.icon} />
                          </svg>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-300">{config.label}</span>
                            {activity.entity_name && (
                              <>
                                <span className="text-zinc-600">·</span>
                                {activity.entity_id ? (
                                  <Link
                                    href={`/admin/skit-library?id=${activity.entity_id}`}
                                    className="text-violet-400 hover:text-violet-300 truncate max-w-[200px]"
                                  >
                                    {activity.entity_name}
                                  </Link>
                                ) : (
                                  <span className="text-zinc-400 truncate max-w-[200px]">{activity.entity_name}</span>
                                )}
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-zinc-500">{formatTime(activity.created_at)}</span>
                            {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                              <span className="text-xs text-zinc-600">
                                {(activity.metadata as Record<string, string>).product_name && `• ${(activity.metadata as Record<string, string>).product_name}`}
                                {(activity.metadata as Record<string, string>).changed_fields && `• Changed: ${(activity.metadata as Record<string, string>).changed_fields}`}
                                {(activity.metadata as Record<string, string>).format && `• Format: ${(activity.metadata as Record<string, string>).format}`}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Time on right for larger screens */}
                        <span className="text-xs text-zinc-600 hidden lg:block">
                          {new Date(activity.created_at).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalCount > limit && (
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/10">
            <span className="text-sm text-zinc-500">
              Showing {page * limit + 1}-{Math.min((page + 1) * limit, totalCount)} of {totalCount}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={(page + 1) * limit >= totalCount}
                className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
