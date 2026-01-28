'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useHydrated, formatDateString } from '@/lib/useHydrated';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import NotificationBadge from '../components/NotificationBadge';

type SlaStatus = 'on_track' | 'due_soon' | 'overdue';

interface OpsMetrics {
  generated_at: string;
  totals: {
    by_status: Record<string, number>;
    by_sla_status: Record<SlaStatus, number>;
    assigned_unclaimed: number;
    claimed: number;
  };
  aging_buckets: Record<string, Record<string, number>>;
  throughput: {
    posted_per_day: { day: string; count: number }[];
    recorded_per_day: { day: string; count: number }[];
    edited_per_day: { day: string; count: number }[];
  };
  blockers: {
    key: string;
    count: number;
    example_video_ids: string[];
  }[];
}

interface AuthUser {
  id: string;
  email: string | null;
  role: string | null;
}

// Status colors for KPI cards
const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  NOT_RECORDED: { bg: '#fff5f5', text: '#c92a2a', border: '#ffc9c9' },
  RECORDED: { bg: '#fff3bf', text: '#e67700', border: '#ffd43b' },
  EDITED: { bg: '#d3f9d8', text: '#2b8a3e', border: '#69db7c' },
  READY_TO_POST: { bg: '#e7f5ff', text: '#1971c2', border: '#74c0fc' },
  POSTED: { bg: '#f8f9fa', text: '#495057', border: '#dee2e6' },
  REJECTED: { bg: '#ffe3e3', text: '#c92a2a', border: '#ffa8a8' },
};

// SLA status colors
const SLA_COLORS: Record<SlaStatus, { bg: string; text: string; border: string }> = {
  overdue: { bg: '#ffe3e3', text: '#c92a2a', border: '#ffa8a8' },
  due_soon: { bg: '#fff3bf', text: '#e67700', border: '#ffd43b' },
  on_track: { bg: '#d3f9d8', text: '#2b8a3e', border: '#69db7c' },
};

// Blocker labels for readability
const BLOCKER_LABELS: Record<string, string> = {
  missing_locked_script: 'Missing Locked Script',
  missing_final_video_url: 'Missing Final Video URL',
  missing_post_fields: 'Missing Post Fields',
  assigned_to_other_user: 'Assigned to Different User',
};

export default function OpsPage() {
  const hydrated = useHydrated();
  const router = useRouter();

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [metrics, setMetrics] = useState<OpsMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Fetch authenticated user
  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/ops');
          return;
        }

        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();

        const userRole = roleData.role as string | null;

        // Admin-only page
        if (userRole !== 'admin') {
          // Redirect to appropriate dashboard
          if (userRole === 'recorder' || userRole === 'editor' || userRole === 'uploader') {
            router.push(`/admin/${userRole}`);
          } else {
            router.push('/admin/pipeline');
          }
          return;
        }

        setAuthUser({
          id: user.id,
          email: user.email || null,
          role: userRole,
        });
      } catch (err) {
        console.error('Auth error:', err);
        router.push('/login?redirect=/admin/ops');
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router]);

  // Fetch metrics
  const fetchMetrics = useCallback(async () => {
    if (!authUser) return;

    setLoading(true);
    try {
      const res = await fetch('/api/admin/ops-metrics');
      const data = await res.json();

      if (data.ok) {
        setMetrics(data.data);
        setError('');
      } else {
        setError(data.error || 'Failed to load metrics');
      }
      setLastRefresh(new Date());
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    if (authUser) {
      fetchMetrics();
      const interval = setInterval(fetchMetrics, 30000); // Auto-refresh every 30s
      return () => clearInterval(interval);
    }
  }, [authUser, fetchMetrics]);

  // Loading states
  if (authLoading) {
    return <div style={{ padding: '20px' }}>Checking admin access...</div>;
  }

  if (!authUser) {
    return <div style={{ padding: '20px' }}>Redirecting...</div>;
  }

  const displayTime = (dateStr: string) => {
    if (!hydrated) return formatDateString(dateStr);
    return new Date(dateStr).toLocaleString();
  };

  // Calculate totals for non-terminal statuses
  const activeStatuses = ['NOT_RECORDED', 'RECORDED', 'EDITED', 'READY_TO_POST'];
  const totalActive = metrics
    ? activeStatuses.reduce((sum, s) => sum + (metrics.totals.by_status[s] || 0), 0)
    : 0;

  // Calculate throughput totals for last 7 days
  const last7Days = (arr: { day: string; count: number }[]) => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return arr
      .filter(item => new Date(item.day) >= sevenDaysAgo)
      .reduce((sum, item) => sum + item.count, 0);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>Ops Analytics Dashboard</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button
            onClick={fetchMetrics}
            disabled={loading}
            style={{
              padding: '8px 16px',
              cursor: loading ? 'not-allowed' : 'pointer',
              backgroundColor: loading ? '#e9ecef' : '#228be6',
              color: loading ? '#666' : 'white',
              border: 'none',
              borderRadius: '4px',
            }}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          {lastRefresh && (
            <span style={{ color: '#666', fontSize: '14px' }}>
              Updated: {hydrated ? lastRefresh.toLocaleTimeString() : ''}
            </span>
          )}
        </div>
      </div>


      {/* User info bar */}
      <div style={{
        marginBottom: '20px',
        padding: '12px 16px',
        backgroundColor: '#ffe3e3',
        borderRadius: '4px',
        border: '1px solid #ffa8a8',
        display: 'flex',
        alignItems: 'center',
        gap: '15px',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 'bold' }}>Admin:</span>
        <span style={{
          padding: '4px 12px',
          backgroundColor: '#fff',
          borderRadius: '4px',
          border: '1px solid #ffa8a8',
        }}>
          {authUser.email || authUser.id.slice(0, 8)}
        </span>
        <button
          onClick={async () => {
            const supabase = createBrowserSupabaseClient();
            await supabase.auth.signOut();
            router.push('/login');
          }}
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

      {error && (
        <div style={{ color: 'red', marginBottom: '20px', padding: '12px', backgroundColor: '#fff5f5', borderRadius: '4px' }}>
          Error: {error}
        </div>
      )}

      {metrics && (
        <>
          {/* Generated timestamp */}
          <div style={{ marginBottom: '20px', color: '#666', fontSize: '12px' }}>
            Metrics generated at: {displayTime(metrics.generated_at)}
          </div>

          {/* KPI Cards - Status Distribution */}
          <section style={{ marginBottom: '30px' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '15px', borderBottom: '1px solid #dee2e6', paddingBottom: '8px' }}>
              Video Status Distribution
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {Object.entries(metrics.totals.by_status).map(([status, count]) => {
                const colors = STATUS_COLORS[status] || STATUS_COLORS.POSTED;
                return (
                  <div
                    key={status}
                    style={{
                      padding: '16px 20px',
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '8px',
                      minWidth: '140px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: colors.text }}>
                      {count}
                    </div>
                    <div style={{ fontSize: '12px', color: colors.text, fontWeight: '500' }}>
                      {status.replace(/_/g, ' ')}
                    </div>
                  </div>
                );
              })}
              <div
                style={{
                  padding: '16px 20px',
                  backgroundColor: '#f8f9fa',
                  border: '2px solid #495057',
                  borderRadius: '8px',
                  minWidth: '140px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#495057' }}>
                  {totalActive}
                </div>
                <div style={{ fontSize: '12px', color: '#495057', fontWeight: '500' }}>
                  TOTAL ACTIVE
                </div>
              </div>
            </div>
          </section>

          {/* KPI Cards - SLA Status */}
          <section style={{ marginBottom: '30px' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '15px', borderBottom: '1px solid #dee2e6', paddingBottom: '8px' }}>
              SLA Status (Active Videos)
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {(['overdue', 'due_soon', 'on_track'] as SlaStatus[]).map((slaStatus) => {
                const colors = SLA_COLORS[slaStatus];
                const count = metrics.totals.by_sla_status[slaStatus];
                const label = slaStatus === 'due_soon' ? 'DUE SOON' : slaStatus.toUpperCase().replace(/_/g, ' ');
                return (
                  <div
                    key={slaStatus}
                    style={{
                      padding: '16px 20px',
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '8px',
                      minWidth: '140px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: colors.text }}>
                      {count}
                    </div>
                    <div style={{ fontSize: '12px', color: colors.text, fontWeight: '500' }}>
                      {label}
                    </div>
                  </div>
                );
              })}
              <div
                style={{
                  padding: '16px 20px',
                  backgroundColor: '#e7f5ff',
                  border: '1px solid #74c0fc',
                  borderRadius: '8px',
                  minWidth: '140px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1971c2' }}>
                  {metrics.totals.claimed}
                </div>
                <div style={{ fontSize: '12px', color: '#1971c2', fontWeight: '500' }}>
                  CLAIMED
                </div>
              </div>
              <div
                style={{
                  padding: '16px 20px',
                  backgroundColor: '#fff3bf',
                  border: '1px solid #ffd43b',
                  borderRadius: '8px',
                  minWidth: '140px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#e67700' }}>
                  {metrics.totals.assigned_unclaimed}
                </div>
                <div style={{ fontSize: '12px', color: '#e67700', fontWeight: '500' }}>
                  ASSIGNED UNCLAIMED
                </div>
              </div>
            </div>
          </section>

          {/* Aging Table */}
          <section style={{ marginBottom: '30px' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '15px', borderBottom: '1px solid #dee2e6', paddingBottom: '8px' }}>
              Aging by Status
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'left' }}>Status</th>
                  <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'center' }}>0-2h</th>
                  <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'center' }}>2-6h</th>
                  <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'center' }}>6-12h</th>
                  <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'center' }}>12-24h</th>
                  <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'center' }}>24h+</th>
                  <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'center', fontWeight: 'bold' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(metrics.aging_buckets).map(([status, buckets]) => {
                  const total = Object.values(buckets).reduce((sum, n) => sum + n, 0);
                  const colors = STATUS_COLORS[status] || STATUS_COLORS.POSTED;
                  return (
                    <tr key={status}>
                      <td style={{
                        border: '1px solid #ccc',
                        padding: '10px',
                        backgroundColor: colors.bg,
                        color: colors.text,
                        fontWeight: 'bold',
                      }}>
                        {status.replace(/_/g, ' ')}
                      </td>
                      {['0-2h', '2-6h', '6-12h', '12-24h', '24h+'].map((bucket) => {
                        const count = buckets[bucket] || 0;
                        const isHigh = bucket === '24h+' && count > 0;
                        return (
                          <td
                            key={bucket}
                            style={{
                              border: '1px solid #ccc',
                              padding: '10px',
                              textAlign: 'center',
                              backgroundColor: isHigh ? '#ffe3e3' : 'transparent',
                              fontWeight: isHigh ? 'bold' : 'normal',
                              color: isHigh ? '#c92a2a' : 'inherit',
                            }}
                          >
                            {count}
                          </td>
                        );
                      })}
                      <td style={{
                        border: '1px solid #ccc',
                        padding: '10px',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        backgroundColor: '#f8f9fa',
                      }}>
                        {total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Throughput Section */}
          <section style={{ marginBottom: '30px' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '15px', borderBottom: '1px solid #dee2e6', paddingBottom: '8px' }}>
              Throughput (Last 30 Days)
            </h2>

            {/* Summary cards */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
              <div style={{
                padding: '16px 20px',
                backgroundColor: '#d3f9d8',
                border: '1px solid #69db7c',
                borderRadius: '8px',
                minWidth: '160px',
              }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2b8a3e' }}>
                  {last7Days(metrics.throughput.posted_per_day)}
                </div>
                <div style={{ fontSize: '12px', color: '#2b8a3e' }}>Posted (7d)</div>
              </div>
              <div style={{
                padding: '16px 20px',
                backgroundColor: '#fff3bf',
                border: '1px solid #ffd43b',
                borderRadius: '8px',
                minWidth: '160px',
              }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#e67700' }}>
                  {last7Days(metrics.throughput.recorded_per_day)}
                </div>
                <div style={{ fontSize: '12px', color: '#e67700' }}>Recorded (7d)</div>
              </div>
              <div style={{
                padding: '16px 20px',
                backgroundColor: '#e7f5ff',
                border: '1px solid #74c0fc',
                borderRadius: '8px',
                minWidth: '160px',
              }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1971c2' }}>
                  {last7Days(metrics.throughput.edited_per_day)}
                </div>
                <div style={{ fontSize: '12px', color: '#1971c2' }}>Edited (7d)</div>
              </div>
            </div>

            {/* Throughput table - last 14 days */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Date</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>Recorded</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>Edited</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>Posted</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Build a map of all days in last 14 days
                  const days: string[] = [];
                  for (let i = 0; i < 14; i++) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    days.push(d.toISOString().split('T')[0]);
                  }

                  const recordedMap = Object.fromEntries(metrics.throughput.recorded_per_day.map(x => [x.day, x.count]));
                  const editedMap = Object.fromEntries(metrics.throughput.edited_per_day.map(x => [x.day, x.count]));
                  const postedMap = Object.fromEntries(metrics.throughput.posted_per_day.map(x => [x.day, x.count]));

                  return days.map((day) => (
                    <tr key={day}>
                      <td style={{ border: '1px solid #ccc', padding: '8px' }}>{day}</td>
                      <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>
                        {recordedMap[day] || 0}
                      </td>
                      <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>
                        {editedMap[day] || 0}
                      </td>
                      <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>
                        {postedMap[day] || 0}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </section>

          {/* Blockers Section */}
          <section style={{ marginBottom: '30px' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '15px', borderBottom: '1px solid #dee2e6', paddingBottom: '8px' }}>
              Blockers
            </h2>
            {metrics.blockers.length === 0 ? (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                backgroundColor: '#d3f9d8',
                borderRadius: '4px',
                color: '#2b8a3e',
              }}>
                No blockers detected
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f5f5f5' }}>
                    <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'left' }}>Blocker Type</th>
                    <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'center', width: '80px' }}>Count</th>
                    <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'left' }}>Example Videos</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.blockers.map((blocker) => (
                    <tr key={blocker.key}>
                      <td style={{
                        border: '1px solid #ccc',
                        padding: '10px',
                        backgroundColor: '#fff5f5',
                        fontWeight: '500',
                      }}>
                        {BLOCKER_LABELS[blocker.key] || blocker.key}
                      </td>
                      <td style={{
                        border: '1px solid #ccc',
                        padding: '10px',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        color: '#c92a2a',
                      }}>
                        {blocker.count}
                      </td>
                      <td style={{ border: '1px solid #ccc', padding: '10px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {blocker.example_video_ids.map((videoId) => (
                            <Link
                              key={videoId}
                              href={`/admin/pipeline/${videoId}`}
                              style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                backgroundColor: '#e9ecef',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontFamily: 'monospace',
                                color: '#1971c2',
                                textDecoration: 'none',
                              }}
                            >
                              {videoId.slice(0, 8)}...
                            </Link>
                          ))}
                          {blocker.count > 5 && (
                            <span style={{ fontSize: '12px', color: '#666' }}>
                              +{blocker.count - 5} more
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {/* Footer */}
      <div style={{ marginTop: '20px', color: '#999', fontSize: '12px' }}>
        Auto-refreshes every 30 seconds. Admin-only dashboard.
      </div>
    </div>
  );
}
