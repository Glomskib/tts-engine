'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { EmptyState } from '../components/AdminPageLayout';

interface EventItem {
  id: string;
  created_at: string;
  type: string;
  video_id: string | null;
  actor_user_id: string | null;
  target_user_id: string | null;
  from_status: string | null;
  to_status: string | null;
  correlation_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface EventsResponse {
  ok: boolean;
  data: EventItem[];
  meta: {
    count: number;
    filters: {
      type: string | null;
      video_id: string | null;
      user_id: string | null;
    };
    limit: number;
  };
}

// Event type colors
const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  recording_status_changed: { bg: '#e7f5ff', text: '#1971c2' },
  claim: { bg: '#fff9db', text: '#e67700' },
  release: { bg: '#fff4e6', text: '#d9480f' },
  handoff: { bg: '#f3f0ff', text: '#7950f2' },
  assigned: { bg: '#d3f9d8', text: '#2f9e44' },
  assignment_reassigned: { bg: '#fff0f6', text: '#c2255c' },
  assignment_extended: { bg: '#e3fafc', text: '#0c8599' },
  assignment_completed: { bg: '#d3f9d8', text: '#2f9e44' },
  assignment_expired: { bg: '#ffe3e3', text: '#c92a2a' },
  force_release: { bg: '#ffe8cc', text: '#d9480f' },
};

export default function AdminEventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState('');
  const [videoIdFilter, setVideoIdFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [limit, setLimit] = useState(100);

  // Known event types for dropdown
  const eventTypes = [
    'recording_status_changed',
    'claim',
    'release',
    'handoff',
    'assigned',
    'assignment_reassigned',
    'assignment_extended',
    'assignment_completed',
    'assignment_expired',
    'force_release',
  ];

  // Check auth and admin status
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login');
        return;
      }
      setUserEmail(user.email || user.id);

      // Check admin role
      supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .single()
        .then(({ data: profile }) => {
          const adminRole = profile?.role === 'admin';
          setIsAdmin(adminRole);
          if (!adminRole) {
            router.push('/admin/pipeline');
          }
        });
    });
  }, [router]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', limit.toString());
      if (typeFilter) params.set('type', typeFilter);
      if (videoIdFilter) params.set('video_id', videoIdFilter);
      if (userIdFilter) params.set('user_id', userIdFilter);

      const res = await fetch(`/api/admin/events?${params.toString()}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to fetch events');
      }

      const data: EventsResponse = await res.json();
      setEvents(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, videoIdFilter, userIdFilter, limit]);

  useEffect(() => {
    if (isAdmin) {
      fetchEvents();
    }
  }, [isAdmin, fetchEvents]);

  const handleSignOut = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  const getEventColor = (type: string) => {
    return EVENT_TYPE_COLORS[type] || { bg: '#f8f9fa', text: '#495057' };
  };

  if (!isAdmin) {
    return <div style={{ padding: '20px' }}>Checking permissions...</div>;
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif', maxWidth: '1400px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h1 style={{ margin: 0, fontSize: '24px' }}>Events Explorer</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
          <span style={{ color: '#666', fontSize: '14px' }}>{userEmail}</span>
          <button
            onClick={handleSignOut}
            style={{
              padding: '4px 10px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Event Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #dee2e6', fontSize: '14px', minWidth: '200px' }}
            >
              <option value="">All Types</option>
              {eventTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Video ID</label>
            <input
              type="text"
              value={videoIdFilter}
              onChange={(e) => setVideoIdFilter(e.target.value)}
              placeholder="Filter by video ID..."
              style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #dee2e6', fontSize: '14px', minWidth: '280px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>User ID (Actor)</label>
            <input
              type="text"
              value={userIdFilter}
              onChange={(e) => setUserIdFilter(e.target.value)}
              placeholder="Filter by actor..."
              style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #dee2e6', fontSize: '14px', minWidth: '280px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Limit</label>
            <select
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value, 10))}
              style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #dee2e6', fontSize: '14px' }}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>

          <button
            onClick={fetchEvents}
            disabled={loading}
            style={{
              padding: '8px 16px',
              backgroundColor: '#1971c2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Loading...' : 'Apply Filters'}
          </button>

          <button
            onClick={() => {
              setTypeFilter('');
              setVideoIdFilter('');
              setUserIdFilter('');
              setLimit(100);
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#868e96',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ color: 'red', marginBottom: '20px', padding: '12px', backgroundColor: '#fff5f5', borderRadius: '4px' }}>
          Error: {error}
        </div>
      )}

      {/* Results count */}
      <div style={{ marginBottom: '10px', color: '#666', fontSize: '14px' }}>
        Showing {events.length} event(s)
      </div>

      {/* Events Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f1f3f4' }}>
              <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Time</th>
              <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Type</th>
              <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Video</th>
              <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Actor</th>
              <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Status Change</th>
              <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && !loading && (
              <tr>
                <td colSpan={6} style={{ padding: 0 }}>
                  <EmptyState
                    title="No events found"
                    description={typeFilter || videoIdFilter || userIdFilter
                      ? "Try adjusting your filters to see more results."
                      : "Events will appear here as users interact with the system."}
                  />
                </td>
              </tr>
            )}
            {events.map((event) => {
              const colors = getEventColor(event.type);
              return (
                <tr key={event.id} style={{ borderBottom: '1px solid #e9ecef' }}>
                  <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                    <span title={event.created_at}>{formatTime(event.created_at)}</span>
                  </td>
                  <td style={{ padding: '10px' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        backgroundColor: colors.bg,
                        color: colors.text,
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      {event.type}
                    </span>
                  </td>
                  <td style={{ padding: '10px' }}>
                    {event.video_id ? (
                      <Link
                        href={`/admin/pipeline/${event.video_id}`}
                        style={{ color: '#1971c2', textDecoration: 'none', fontFamily: 'monospace', fontSize: '12px' }}
                      >
                        {event.video_id.slice(0, 8)}...
                      </Link>
                    ) : (
                      <span style={{ color: '#adb5bd' }}>-</span>
                    )}
                  </td>
                  <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '12px' }}>
                    {event.actor_user_id ? (
                      <span title={event.actor_user_id}>
                        {event.actor_user_id.slice(0, 8)}...
                      </span>
                    ) : (
                      <span style={{ color: '#adb5bd' }}>system</span>
                    )}
                  </td>
                  <td style={{ padding: '10px' }}>
                    {event.from_status || event.to_status ? (
                      <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                        {event.from_status || '?'} → {event.to_status || '?'}
                      </span>
                    ) : (
                      <span style={{ color: '#adb5bd' }}>-</span>
                    )}
                  </td>
                  <td style={{ padding: '10px', maxWidth: '300px' }}>
                    {event.metadata ? (
                      <details style={{ cursor: 'pointer' }}>
                        <summary style={{ color: '#1971c2', fontSize: '12px' }}>View</summary>
                        <pre style={{ fontSize: '11px', backgroundColor: '#f8f9fa', padding: '8px', borderRadius: '4px', overflow: 'auto', maxHeight: '150px', marginTop: '5px' }}>
                          {JSON.stringify(event.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span style={{ color: '#adb5bd' }}>-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
