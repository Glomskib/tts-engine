'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useHydrated, getTimeAgo, formatDateString } from '@/lib/useHydrated';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

interface Notification {
  id: string;
  user_id: string;
  type: 'handoff' | 'assigned' | 'status_changed' | 'script_attached' | 'comment';
  video_id: string | null;
  payload: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

interface AuthUser {
  id: string;
  email: string | null;
  role: 'admin' | 'recorder' | 'editor' | 'uploader' | null;
}

function getNotificationMessage(notification: Notification): string {
  const payload = notification.payload;
  switch (notification.type) {
    case 'handoff':
      return `Handoff from ${payload.from || 'unknown'} as ${payload.to_role || 'unknown role'}`;
    case 'assigned':
      return `Assigned by ${payload.assigned_by || 'unknown'}${payload.notes ? `: ${payload.notes}` : ''}`;
    case 'status_changed':
      return `Status changed to ${payload.new_status || 'unknown'}`;
    case 'script_attached':
      return `Script attached: ${payload.script_title || 'Unknown script'}`;
    case 'comment':
      return `New comment: ${payload.preview || '...'}`;
    default:
      return 'New notification';
  }
}

function getTypeColor(type: string): { bg: string; text: string } {
  switch (type) {
    case 'handoff':
      return { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa' };
    case 'assigned':
      return { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399' };
    case 'status_changed':
      return { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24' };
    case 'script_attached':
      return { bg: 'rgba(139, 92, 246, 0.15)', text: '#a78bfa' };
    case 'comment':
      return { bg: 'rgba(113, 113, 122, 0.15)', text: '#a1a1aa' };
    default:
      return { bg: 'rgba(113, 113, 122, 0.15)', text: '#a1a1aa' };
  }
}

export default function NotificationsPage() {
  const hydrated = useHydrated();
  const router = useRouter();

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());

  // Fetch authenticated user
  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/notifications');
          return;
        }

        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();

        setAuthUser({
          id: user.id,
          email: user.email || null,
          role: roleData.role || null,
        });
      } catch (err) {
        console.error('Auth error:', err);
        router.push('/login?redirect=/admin/notifications');
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!authUser) return;

    setLoading(true);
    try {
      const res = await fetch('/api/notifications?limit=100');
      const data = await res.json();

      if (data.ok) {
        setNotifications(data.data || []);
        setUnreadCount(data.meta?.unread_count || 0);
      } else {
        setError(data.error || 'Failed to load notifications');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    if (authUser) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 20000);
      return () => clearInterval(interval);
    }
  }, [authUser, fetchNotifications]);

  // Mark single as read
  const markAsRead = async (id: string) => {
    setMarkingIds(prev => new Set(prev).add(id));
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
      // Update local state
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    } finally {
      setMarkingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      // Update local state
      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true, read_at: n.read_at || new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  // Loading states
  if (authLoading) {
    return <div className="py-10 text-center text-zinc-500">Checking access...</div>;
  }

  if (!authUser) {
    return <div className="py-10 text-center text-zinc-500">Redirecting...</div>;
  }

  const displayTime = (dateStr: string) => {
    if (!hydrated) return formatDateString(dateStr);
    return getTimeAgo(dateStr);
  };

  // Separate unread and read
  const unreadNotifications = notifications.filter(n => !n.is_read);
  const readNotifications = notifications.filter(n => n.is_read);

  const handleRefresh = async () => {
    await fetchNotifications();
  };

  return (
    <PullToRefresh onRefresh={handleRefresh} className="max-w-full overflow-hidden pb-24 lg:pb-6 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-xl font-semibold text-zinc-100 flex items-center gap-3">
          Notifications
          {unreadCount > 0 && (
            <span className="px-2.5 py-1 bg-red-500 text-white rounded-full text-sm font-medium">
              {unreadCount} unread
            </span>
          )}
        </h1>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <button type="button"
              onClick={markAllAsRead}
              className="px-4 py-2.5 bg-violet-600 text-white rounded-lg font-medium text-sm hover:bg-violet-700 transition-colors min-h-[44px] btn-press"
            >
              Mark All Read
            </button>
          )}
          <button type="button"
            onClick={fetchNotifications}
            className="px-4 py-2.5 bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-lg font-medium text-sm hover:bg-zinc-700 transition-colors min-h-[44px] btn-press"
          >
            Refresh
          </button>
        </div>
      </div>


      {error && (
        <div className="text-red-400 mb-5 text-sm">Error: {error}</div>
      )}

      {loading && notifications.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <Skeleton height={24} width={80} className="rounded" />
                <Skeleton height={16} width="60%" className="flex-1" />
                <Skeleton height={12} width={60} />
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="When you get handoffs, assignments, or status updates, they'll appear here."
        />
      ) : (
        <>
          {/* Unread section */}
          {unreadNotifications.length > 0 && (
            <div className="mb-8">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Unread</h3>
              {unreadNotifications.map(n => {
                const typeColors = getTypeColor(n.type);
                const isMarking = markingIds.has(n.id);
                return (
                  <div
                    key={n.id}
                    className="p-4 bg-zinc-900/50 border-2 border-violet-500/50 rounded-xl mb-3 flex flex-col sm:flex-row sm:items-center gap-3 card-press"
                  >
                    <span
                      className="px-2 py-1 rounded text-xs font-bold uppercase self-start"
                      style={{ backgroundColor: typeColors.bg, color: typeColors.text }}
                    >
                      {n.type.replace('_', ' ')}
                    </span>
                    <span className="flex-1 text-zinc-100 text-sm">{getNotificationMessage(n)}</span>
                    <span className="text-zinc-500 text-xs">
                      {displayTime(n.created_at)}
                    </span>
                    <div className="flex gap-2 mt-2 sm:mt-0">
                      {n.video_id && (
                        <Link
                          href={`/admin/pipeline/${n.video_id}`}
                          className="px-3 py-2 bg-zinc-800 text-zinc-100 rounded-lg text-xs font-medium hover:bg-zinc-700 transition-colors min-h-[36px] flex items-center"
                        >
                          View
                        </Link>
                      )}
                      <button type="button"
                        onClick={() => markAsRead(n.id)}
                        disabled={isMarking}
                        className={`px-3 py-2 rounded-lg text-xs font-medium min-h-[36px] transition-colors btn-press ${
                          isMarking
                            ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                            : 'bg-violet-600 text-white hover:bg-violet-700 cursor-pointer'
                        }`}
                      >
                        {isMarking ? '...' : 'Mark Read'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Read section */}
          {readNotifications.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">Read</h3>
              {readNotifications.map(n => {
                const typeColors = getTypeColor(n.type);
                return (
                  <div
                    key={n.id}
                    className="p-4 bg-zinc-900/30 border border-zinc-800 rounded-xl mb-3 flex flex-col sm:flex-row sm:items-center gap-3 opacity-70 card-press"
                  >
                    <span
                      className="px-2 py-1 rounded text-xs font-bold uppercase self-start"
                      style={{ backgroundColor: typeColors.bg, color: typeColors.text }}
                    >
                      {n.type.replace('_', ' ')}
                    </span>
                    <span className="flex-1 text-zinc-300 text-sm">{getNotificationMessage(n)}</span>
                    <span className="text-zinc-500 text-xs">
                      {displayTime(n.created_at)}
                    </span>
                    {n.video_id && (
                      <Link
                        href={`/admin/pipeline/${n.video_id}`}
                        className="px-3 py-2 bg-zinc-800 text-zinc-400 rounded-lg text-xs font-medium hover:bg-zinc-700 hover:text-zinc-200 transition-colors min-h-[36px] flex items-center self-start sm:self-auto"
                      >
                        View
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <div className="mt-6 text-zinc-500 text-xs">
        Auto-refreshes every 20 seconds • Pull down to refresh
      </div>
    </PullToRefresh>
  );
}
