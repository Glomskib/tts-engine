'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useHydrated, formatDateString } from '@/lib/useHydrated';
import { EmptyState } from '../components/AdminPageLayout';
import SimpleBarChart from './components/SimpleBarChart';
import { FileText, Video, Coins, ArrowRight, TrendingUp } from 'lucide-react';

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

// Content Analytics Types
interface DailyCount {
  date: string;
  count: number;
}

interface ContentTypeBreakdown {
  type: string;
  count: number;
  percentage: number;
}

interface ConversionFunnel {
  scripts_created: number;
  scripts_with_video: number;
  videos_completed: number;
  conversion_rate_to_video: number;
  completion_rate: number;
}

interface CreditUsage {
  date: string;
  credits_used: number;
  ai_calls: number;
}

interface ContentAnalytics {
  period_days: number;
  scripts_by_day: DailyCount[];
  videos_completed_by_day: DailyCount[];
  credits_by_day: CreditUsage[];
  content_types: ContentTypeBreakdown[];
  funnel: ConversionFunnel;
  summary: {
    total_scripts: number;
    total_credits_used: number;
    total_ai_calls: number;
    avg_credits_per_day: number;
  };
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
  const [contentData, setContentData] = useState<ContentAnalytics | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pipeline' | 'content'>('content');

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
      // Fetch both pipeline and content analytics in parallel
      const [pipelineRes, contentRes] = await Promise.all([
        fetch(`/api/admin/analytics/summary?window=${window}`),
        fetch(`/api/admin/analytics/content?days=${window}`),
      ]);

      const [pipelineResult, contentResult] = await Promise.all([
        pipelineRes.json(),
        contentRes.json(),
      ]);

      if (pipelineResult.ok) {
        setData(pipelineResult.data);
      }

      if (contentResult.ok) {
        setContentData(contentResult.data);
      }

      if (!pipelineResult.ok && !contentResult.ok) {
        setError('Failed to load analytics');
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

      {/* Tab Selector */}
      <div style={{
        display: 'flex',
        gap: '0',
        marginBottom: '20px',
        borderBottom: '2px solid #dee2e6',
      }}>
        <button
          onClick={() => setActiveTab('content')}
          style={{
            padding: '12px 24px',
            backgroundColor: 'transparent',
            color: activeTab === 'content' ? '#1971c2' : '#6c757d',
            border: 'none',
            borderBottom: activeTab === 'content' ? '2px solid #1971c2' : '2px solid transparent',
            marginBottom: '-2px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'content' ? 'bold' : 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <TrendingUp size={16} />
          Content Performance
        </button>
        <button
          onClick={() => setActiveTab('pipeline')}
          style={{
            padding: '12px 24px',
            backgroundColor: 'transparent',
            color: activeTab === 'pipeline' ? '#1971c2' : '#6c757d',
            border: 'none',
            borderBottom: activeTab === 'pipeline' ? '2px solid #1971c2' : '2px solid transparent',
            marginBottom: '-2px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'pipeline' ? 'bold' : 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Video size={16} />
          Pipeline Analytics
        </button>
      </div>

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

      {/* Content Performance Tab - No Data */}
      {!loading && !error && activeTab === 'content' && !contentData && (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6',
        }}>
          <p style={{ color: '#6c757d', margin: 0 }}>No content analytics data available.</p>
        </div>
      )}

      {/* Content Performance Tab */}
      {!loading && !error && activeTab === 'content' && contentData && (
        <>
          {/* Content Summary Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '15px',
            marginBottom: '20px',
          }}>
            <div style={{
              padding: '20px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #dee2e6',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <FileText size={20} style={{ color: '#1971c2' }} />
                <span style={{ fontSize: '13px', color: '#6c757d' }}>Scripts Created</span>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1971c2' }}>
                {contentData.summary.total_scripts}
              </div>
            </div>
            <div style={{
              padding: '20px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #dee2e6',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <Video size={20} style={{ color: '#2b8a3e' }} />
                <span style={{ fontSize: '13px', color: '#6c757d' }}>Videos Completed</span>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#2b8a3e' }}>
                {contentData.funnel.videos_completed}
              </div>
            </div>
            <div style={{
              padding: '20px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #dee2e6',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <Coins size={20} style={{ color: '#e67700' }} />
                <span style={{ fontSize: '13px', color: '#6c757d' }}>Credits Used</span>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#e67700' }}>
                {contentData.summary.total_credits_used}
              </div>
            </div>
            <div style={{
              padding: '20px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #dee2e6',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <TrendingUp size={20} style={{ color: '#862e9c' }} />
                <span style={{ fontSize: '13px', color: '#6c757d' }}>AI Calls</span>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#862e9c' }}>
                {contentData.summary.total_ai_calls}
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '20px',
            marginBottom: '20px',
          }}>
            {/* Scripts Over Time Chart */}
            <div style={{
              border: '1px solid #dee2e6',
              borderRadius: '8px',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '12px 16px',
                backgroundColor: '#f8f9fa',
                borderBottom: '1px solid #dee2e6',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <FileText size={16} style={{ color: '#1971c2' }} />
                <h3 style={{ margin: 0, fontSize: '14px' }}>Scripts Generated</h3>
              </div>
              <div style={{ padding: '20px' }}>
                <SimpleBarChart
                  data={contentData.scripts_by_day}
                  color="#3b82f6"
                  height={140}
                  showLabels={windowDays <= 14}
                />
              </div>
            </div>

            {/* Videos Completed Chart */}
            <div style={{
              border: '1px solid #dee2e6',
              borderRadius: '8px',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '12px 16px',
                backgroundColor: '#f8f9fa',
                borderBottom: '1px solid #dee2e6',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <Video size={16} style={{ color: '#2b8a3e' }} />
                <h3 style={{ margin: 0, fontSize: '14px' }}>Videos Completed</h3>
              </div>
              <div style={{ padding: '20px' }}>
                <SimpleBarChart
                  data={contentData.videos_completed_by_day}
                  color="#22c55e"
                  height={140}
                  showLabels={windowDays <= 14}
                />
              </div>
            </div>
          </div>

          {/* Credit Usage Chart */}
          <div style={{
            marginBottom: '20px',
            border: '1px solid #dee2e6',
            borderRadius: '8px',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#f8f9fa',
              borderBottom: '1px solid #dee2e6',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <Coins size={16} style={{ color: '#e67700' }} />
              <h3 style={{ margin: 0, fontSize: '14px' }}>Credit Usage Trends</h3>
              <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#6c757d' }}>
                Avg: {contentData.summary.avg_credits_per_day} credits/day
              </span>
            </div>
            <div style={{ padding: '20px' }}>
              <SimpleBarChart
                data={contentData.credits_by_day.map(d => ({ date: d.date, count: d.credits_used }))}
                color="#f59e0b"
                height={120}
                showLabels={windowDays <= 14}
              />
            </div>
          </div>

          {/* Content Types and Funnel Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '20px',
            marginBottom: '20px',
          }}>
            {/* Content Type Breakdown */}
            <div style={{
              border: '1px solid #dee2e6',
              borderRadius: '8px',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '12px 16px',
                backgroundColor: '#f8f9fa',
                borderBottom: '1px solid #dee2e6',
              }}>
                <h3 style={{ margin: 0, fontSize: '14px' }}>Top Content Types</h3>
              </div>
              <div style={{ padding: '16px' }}>
                {contentData.content_types.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#6c757d', fontSize: '13px' }}>
                    No content type data available
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {contentData.content_types.slice(0, 5).map((ct) => (
                      <div key={ct.type}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '500', textTransform: 'capitalize' }}>
                            {ct.type.replace(/_/g, ' ')}
                          </span>
                          <span style={{ fontSize: '12px', color: '#6c757d' }}>
                            {ct.count} ({ct.percentage}%)
                          </span>
                        </div>
                        <div style={{
                          height: '8px',
                          backgroundColor: '#e9ecef',
                          borderRadius: '4px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${ct.percentage}%`,
                            backgroundColor: '#3b82f6',
                            borderRadius: '4px',
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Conversion Funnel */}
            <div style={{
              border: '1px solid #dee2e6',
              borderRadius: '8px',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '12px 16px',
                backgroundColor: '#f8f9fa',
                borderBottom: '1px solid #dee2e6',
              }}>
                <h3 style={{ margin: 0, fontSize: '14px' }}>Conversion Funnel</h3>
              </div>
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Scripts Created */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      flex: 1,
                      padding: '12px 16px',
                      backgroundColor: '#dbeafe',
                      borderRadius: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: '#1e40af' }}>Scripts Created</span>
                      <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e40af' }}>
                        {contentData.funnel.scripts_created}
                      </span>
                    </div>
                  </div>

                  {/* Arrow with conversion rate */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <ArrowRight size={16} style={{ color: '#6c757d', transform: 'rotate(90deg)' }} />
                    <span style={{ fontSize: '12px', color: '#6c757d', fontWeight: '500' }}>
                      {contentData.funnel.conversion_rate_to_video}% conversion
                    </span>
                  </div>

                  {/* Scripts with Video */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      flex: 1,
                      padding: '12px 16px',
                      backgroundColor: '#fef3c7',
                      borderRadius: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: '#92400e' }}>Scripts → Videos</span>
                      <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#92400e' }}>
                        {contentData.funnel.scripts_with_video}
                      </span>
                    </div>
                  </div>

                  {/* Arrow with completion rate */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <ArrowRight size={16} style={{ color: '#6c757d', transform: 'rotate(90deg)' }} />
                    <span style={{ fontSize: '12px', color: '#6c757d', fontWeight: '500' }}>
                      {contentData.funnel.completion_rate}% completion
                    </span>
                  </div>

                  {/* Videos Completed */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      flex: 1,
                      padding: '12px 16px',
                      backgroundColor: '#dcfce7',
                      borderRadius: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: '#166534' }}>Videos Completed</span>
                      <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#166534' }}>
                        {contentData.funnel.videos_completed}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Pipeline Analytics Tab */}
      {!loading && !error && activeTab === 'pipeline' && data && (
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
