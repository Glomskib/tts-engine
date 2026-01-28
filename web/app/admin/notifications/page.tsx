'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useHydrated, getTimeAgo, formatDateString } from '@/lib/useHydrated';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

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
      return { bg: '#e7f5ff', text: '#1971c2' };
    case 'assigned':
      return { bg: '#d3f9d8', text: '#2b8a3e' };
    case 'status_changed':
      return { bg: '#fff3bf', text: '#e67700' };
    case 'script_attached':
      return { bg: '#e5dbff', text: '#6741d9' };
    case 'comment':
      return { bg: '#f8f9fa', text: '#495057' };
    default:
      return { bg: '#f8f9fa', text: '#495057' };
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
    } catch (err) {
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
    return <div style={{ padding: '20px' }}>Checking access...</div>;
  }

  if (!authUser) {
    return <div style={{ padding: '20px' }}>Redirecting...</div>;
  }

  const displayTime = (dateStr: string) => {
    if (!hydrated) return formatDateString(dateStr);
    return getTimeAgo(dateStr);
  };

  // Separate unread and read
  const unreadNotifications = notifications.filter(n => !n.is_read);
  const readNotifications = notifications.filter(n => n.is_read);

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>
          Notifications
          {unreadCount > 0 && (
            <span style={{
              marginLeft: '10px',
              padding: '4px 10px',
              backgroundColor: '#fa5252',
              color: 'white',
              borderRadius: '12px',
              fontSize: '14px',
            }}>
              {unreadCount} unread
            </span>
          )}
        </h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              style={{
                padding: '8px 16px',
                backgroundColor: '#228be6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Mark All Read
            </button>
          )}
          <button
            onClick={fetchNotifications}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f1f3f5',
              color: '#333',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      </div>


      {error && (
        <div style={{ color: 'red', marginBottom: '20px' }}>Error: {error}</div>
      )}

      {loading && notifications.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Loading...</div>
      ) : notifications.length === 0 ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          backgroundColor: '#f8f9fa',
          borderRadius: '4px',
          color: '#666',
        }}>
          No notifications yet
        </div>
      ) : (
        <>
          {/* Unread section */}
          {unreadNotifications.length > 0 && (
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#495057' }}>Unread</h3>
              {unreadNotifications.map(n => {
                const colors = getTypeColor(n.type);
                const isMarking = markingIds.has(n.id);
                return (
                  <div
                    key={n.id}
                    style={{
                      padding: '12px 16px',
                      backgroundColor: '#fff',
                      border: '2px solid #228be6',
                      borderRadius: '4px',
                      marginBottom: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <span style={{
                      padding: '3px 8px',
                      backgroundColor: colors.bg,
                      color: colors.text,
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                    }}>
                      {n.type.replace('_', ' ')}
                    </span>
                    <span style={{ flex: 1 }}>{getNotificationMessage(n)}</span>
                    <span style={{ color: '#868e96', fontSize: '12px' }}>
                      {displayTime(n.created_at)}
                    </span>
                    {n.video_id && (
                      <Link
                        href={`/admin/pipeline/${n.video_id}`}
                        style={{
                          padding: '4px 10px',
                          backgroundColor: '#e7f5ff',
                          color: '#1971c2',
                          borderRadius: '4px',
                          textDecoration: 'none',
                          fontSize: '12px',
                        }}
                      >
                        View
                      </Link>
                    )}
                    <button
                      onClick={() => markAsRead(n.id)}
                      disabled={isMarking}
                      style={{
                        padding: '4px 10px',
                        backgroundColor: isMarking ? '#ccc' : '#228be6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: isMarking ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      {isMarking ? '...' : 'Mark Read'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Read section */}
          {readNotifications.length > 0 && (
            <div>
              <h3 style={{ margin: '0 0 10px 0', color: '#adb5bd' }}>Read</h3>
              {readNotifications.map(n => {
                const colors = getTypeColor(n.type);
                return (
                  <div
                    key={n.id}
                    style={{
                      padding: '12px 16px',
                      backgroundColor: '#f8f9fa',
                      border: '1px solid #dee2e6',
                      borderRadius: '4px',
                      marginBottom: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      opacity: 0.7,
                    }}
                  >
                    <span style={{
                      padding: '3px 8px',
                      backgroundColor: colors.bg,
                      color: colors.text,
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                    }}>
                      {n.type.replace('_', ' ')}
                    </span>
                    <span style={{ flex: 1 }}>{getNotificationMessage(n)}</span>
                    <span style={{ color: '#868e96', fontSize: '12px' }}>
                      {displayTime(n.created_at)}
                    </span>
                    {n.video_id && (
                      <Link
                        href={`/admin/pipeline/${n.video_id}`}
                        style={{
                          padding: '4px 10px',
                          backgroundColor: '#e9ecef',
                          color: '#495057',
                          borderRadius: '4px',
                          textDecoration: 'none',
                          fontSize: '12px',
                        }}
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

      <div style={{ marginTop: '20px', color: '#adb5bd', fontSize: '12px' }}>
        Auto-refreshes every 20 seconds
      </div>
    </div>
  );
}
