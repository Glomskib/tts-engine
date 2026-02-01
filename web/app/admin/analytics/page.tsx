'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useHydrated, formatDateString } from '@/lib/useHydrated';
import { EmptyState } from '../components/AdminPageLayout';

interface StageStats {
  stage: string;
  from_status: string;
  to_status: string;
  count: number;
  avg_minutes: number;
  median_minutes: number;
  p90_minutes: number;
}

interface ThroughputDay {
  date: string;
  recorded: number;
  edited: number;
  ready_to_post: number;
  posted: number;
}

interface UserProductivity {
  user_id: string;
  email: string | null;
  role: string;
  completed: number;
  last_active_at: string | null;
}

interface AnalyticsSummary {
  window_days: number;
  computed_at: string;
  stage_stats: StageStats[];
  throughput_by_day: ThroughputDay[];
  productivity: UserProductivity[];
}

const STAGE_LABELS: Record<string, string> = {
  recording: 'Recording',
  editing: 'Editing',
  post_prep: 'Post Prep',
  posting: 'Posting',
};

function formatDuration(minutes: number): string {
  if (minutes === 0) return '-';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 60 * 24) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.round((minutes % (60 * 24)) / 60);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [windowDays, setWindowDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  // Fetch authenticated user and check admin status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/analytics');
          return;
        }

        // Check if admin
        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();

        if (roleData.role !== 'admin') {
          router.push('/admin/pipeline');
          return;
        }

        setIsAdmin(true);
      } catch (err) {
        console.error('Auth error:', err);
        router.push('/login?redirect=/admin/analytics');
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // Fetch analytics data
  const fetchData = async (window: number) => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/admin/analytics/summary?window=${window}`);
      const result = await res.json();

      if (result.ok) {
        setData(result.data);
      } else {
        setError(result.error || 'Failed to load analytics');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchData(windowDays);
    }
  }, [isAdmin, windowDays]);

  // Export CSV
  const exportCsv = async (type: 'stage' | 'throughput' | 'productivity') => {
    setExporting(type);
    try {
      const res = await fetch(`/api/admin/analytics/export?window=${windowDays}&type=${type}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics_${type}_${windowDays}d.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('Export failed');
      }
    } catch (err) {
      alert('Export error');
    } finally {
      setExporting(null);
    }
  };

  if (authLoading) {
    return <div style={{ padding: '20px' }}>Checking access...</div>;
  }

  if (!isAdmin) {
    return <div style={{ padding: '20px' }}>Redirecting...</div>;
  }

  // Calculate totals for throughput
  const throughputTotals = data?.throughput_by_day.reduce(
    (acc, day) => ({
      recorded: acc.recorded + day.recorded,
      edited: acc.edited + day.edited,
      ready_to_post: acc.ready_to_post + day.ready_to_post,
      posted: acc.posted + day.posted,
    }),
    { recorded: 0, edited: 0, ready_to_post: 0, posted: 0 }
  ) || { recorded: 0, edited: 0, ready_to_post: 0, posted: 0 };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }} className="pb-24 lg:pb-6">

      {/* Header */}
      <h1 style={{ margin: '0 0 20px 0' }}>Analytics Dashboard</h1>

      {/* Window Selector */}
      <div style={{
        display: 'flex',
        gap: '10px',
        marginBottom: '20px',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: '14px', color: '#6c757d' }}>Time Window:</span>
        {[7, 14, 30].map((w) => (
          <button
            key={w}
            onClick={() => setWindowDays(w)}
            style={{
              padding: '8px 16px',
              backgroundColor: windowDays === w ? '#1971c2' : '#f8f9fa',
              color: windowDays === w ? 'white' : '#495057',
              border: `1px solid ${windowDays === w ? '#1971c2' : '#dee2e6'}`,
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: windowDays === w ? 'bold' : 'normal',
            }}
          >
            {w} Days
          </button>
        ))}
        {data?.computed_at && hydrated && (
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#adb5bd' }}>
            Last computed: {formatDateString(data.computed_at)}
          </span>
        )}
      </div>

      {/* Loading/Error */}
      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          Loading analytics...
        </div>
      )}

      {error && (
        <div style={{
          padding: '20px',
          backgroundColor: '#f8d7da',
          borderRadius: '4px',
          color: '#721c24',
          marginBottom: '20px',
        }}>
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Stage Duration Stats */}
          <div style={{
            marginBottom: '30px',
            border: '1px solid #dee2e6',
            borderRadius: '8px',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              backgroundColor: '#f8f9fa',
              borderBottom: '1px solid #dee2e6',
            }}>
              <h2 style={{ margin: 0, fontSize: '16px' }}>Stage Duration (SLA)</h2>
              <button
                onClick={() => exportCsv('stage')}
                disabled={exporting === 'stage'}
                style={{
                  padding: '6px 12px',
                  backgroundColor: exporting === 'stage' ? '#adb5bd' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: exporting === 'stage' ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                }}
              >
                {exporting === 'stage' ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Stage</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Transition</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>Samples</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>Average</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>Median</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>P90</th>
                </tr>
              </thead>
              <tbody>
                {data.stage_stats.map((stat) => (
                  <tr key={stat.stage} style={{ borderBottom: '1px solid #dee2e6' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 'bold' }}>
                      {STAGE_LABELS[stat.stage] || stat.stage}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: '#6c757d' }}>
                      {stat.from_status} &rarr; {stat.to_status}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      {stat.count === 0 ? (
                        <span style={{ color: '#adb5bd' }}>-</span>
                      ) : (
                        stat.count
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatDuration(stat.avg_minutes)}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatDuration(stat.median_minutes)}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatDuration(stat.p90_minutes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.stage_stats.every(s => s.count === 0) && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#6c757d', fontSize: '13px' }}>
                No stage transition data available for this time window.
              </div>
            )}
          </div>

          {/* Throughput Summary */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '15px',
            marginBottom: '20px',
          }}>
            {[
              { label: 'Recorded', value: throughputTotals.recorded, color: '#1971c2' },
              { label: 'Edited', value: throughputTotals.edited, color: '#2b8a3e' },
              { label: 'Ready to Post', value: throughputTotals.ready_to_post, color: '#e67700' },
              { label: 'Posted', value: throughputTotals.posted, color: '#862e9c' },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  padding: '15px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px',
                  border: '1px solid #dee2e6',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: item.color }}>
                  {item.value}
                </div>
                <div style={{ fontSize: '13px', color: '#6c757d' }}>{item.label}</div>
              </div>
            ))}
          </div>

          {/* Throughput by Day */}
          <div style={{
            marginBottom: '30px',
            border: '1px solid #dee2e6',
            borderRadius: '8px',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              backgroundColor: '#f8f9fa',
              borderBottom: '1px solid #dee2e6',
            }}>
              <h2 style={{ margin: 0, fontSize: '16px' }}>Daily Throughput</h2>
              <button
                onClick={() => exportCsv('throughput')}
                disabled={exporting === 'throughput'}
                style={{
                  padding: '6px 12px',
                  backgroundColor: exporting === 'throughput' ? '#adb5bd' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: exporting === 'throughput' ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                }}
              >
                {exporting === 'throughput' ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f9fa' }}>
                  <tr>
                    <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Date</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>Recorded</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>Edited</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>Ready</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>Posted</th>
                  </tr>
                </thead>
                <tbody>
                  {data.throughput_by_day.slice().reverse().map((day) => (
                    <tr key={day.date} style={{ borderBottom: '1px solid #dee2e6' }}>
                      <td style={{ padding: '8px 16px', fontSize: '13px' }}>{day.date}</td>
                      <td style={{ padding: '8px 16px', textAlign: 'right', color: day.recorded > 0 ? '#1971c2' : '#adb5bd' }}>
                        {day.recorded || '-'}
                      </td>
                      <td style={{ padding: '8px 16px', textAlign: 'right', color: day.edited > 0 ? '#2b8a3e' : '#adb5bd' }}>
                        {day.edited || '-'}
                      </td>
                      <td style={{ padding: '8px 16px', textAlign: 'right', color: day.ready_to_post > 0 ? '#e67700' : '#adb5bd' }}>
                        {day.ready_to_post || '-'}
                      </td>
                      <td style={{ padding: '8px 16px', textAlign: 'right', color: day.posted > 0 ? '#862e9c' : '#adb5bd' }}>
                        {day.posted || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* User Productivity */}
          <div style={{
            marginBottom: '30px',
            border: '1px solid #dee2e6',
            borderRadius: '8px',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              backgroundColor: '#f8f9fa',
              borderBottom: '1px solid #dee2e6',
            }}>
              <h2 style={{ margin: 0, fontSize: '16px' }}>User Productivity</h2>
              <button
                onClick={() => exportCsv('productivity')}
                disabled={exporting === 'productivity'}
                style={{
                  padding: '6px 12px',
                  backgroundColor: exporting === 'productivity' ? '#adb5bd' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: exporting === 'productivity' ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                }}
              >
                {exporting === 'productivity' ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
            {data.productivity.length === 0 ? (
              <EmptyState
                title="No productivity data"
                description="Assignment completion data will appear here once users start completing tasks."
              />
            ) : (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f9fa' }}>
                    <tr>
                      <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>User</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Role</th>
                      <th style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>Completed</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.productivity.map((user, idx) => (
                      <tr key={`${user.user_id}-${user.role}-${idx}`} style={{ borderBottom: '1px solid #dee2e6' }}>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ fontWeight: 'bold', fontSize: '13px' }}>
                            {user.email || 'No email'}
                          </div>
                          <div style={{ fontSize: '11px', color: '#adb5bd', fontFamily: 'monospace' }}>
                            {user.user_id.slice(0, 8)}...
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{
                            padding: '3px 8px',
                            backgroundColor: '#e7f5ff',
                            color: '#1971c2',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                          }}>
                            {user.role}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 'bold', fontSize: '16px' }}>
                          {user.completed}
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: '12px', color: '#6c757d' }}>
                          {user.last_active_at && hydrated ? formatDateString(user.last_active_at) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
