'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useHydrated, formatDateString } from '@/lib/useHydrated';
import { EmptyState } from '../components/AdminPageLayout';
import SimpleBarChart from './components/SimpleBarChart';
import { FileText, Video, Coins, ArrowRight, TrendingUp, TrendingDown, Trophy, Eye, Percent, Target, Brain, RefreshCw, AlertTriangle } from 'lucide-react';
import type { WinnersAnalytics } from '@/lib/analytics/types';
import { StatCard } from '@/components/analytics/StatCard';
import { TopPerformersCard } from '@/components/analytics/TopPerformersCard';
import { VideoLengthChart } from '@/components/analytics/VideoLengthChart';
import { TrendsChart } from '@/components/analytics/TrendsChart';
import { RecommendationCard } from '@/components/analytics/RecommendationCard';
import { WinnersEmptyState } from '@/components/analytics/WinnersEmptyState';

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

/* eslint-disable @typescript-eslint/no-explicit-any */
function ClawbotWeeklyInsights() {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/clawbot/summaries/latest', { credentials: 'include' });
      const json = await res.json();
      setSummary(json.summary);
    } catch (error) {
      console.error('Failed to load summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateSummary = async () => {
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/clawbot/summaries/weekly', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Weekly summary generated!' });
        await loadSummary();
      } else {
        setMessage({ type: 'error', text: 'Failed to generate summary' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to generate summary' });
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  return (
    <div style={{
      backgroundColor: '#18181b',
      border: '1px solid #27272a',
      borderRadius: '8px',
      padding: '24px',
      marginBottom: '24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <Brain size={20} style={{ color: '#a855f7' }} />
          Clawbot Weekly Insights
        </h3>
        <button
          type="button"
          onClick={generateSummary}
          disabled={generating}
          style={{
            padding: '8px 16px',
            backgroundColor: generating ? '#6b21a8' : '#a855f7',
            color: '#fff',
            fontSize: '13px',
            border: 'none',
            borderRadius: '8px',
            cursor: generating ? 'not-allowed' : 'pointer',
            opacity: generating ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <RefreshCw size={14} style={generating ? { animation: 'spin 1s linear infinite' } : {}} />
          {generating ? 'Generating...' : summary ? 'Regenerate' : 'Generate Summary'}
        </button>
      </div>

      {message && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '6px',
          marginBottom: '12px',
          fontSize: '13px',
          backgroundColor: message.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          color: message.type === 'success' ? '#4ade80' : '#f87171',
        }}>
          {message.text}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#a1a1aa', margin: 0 }}>Loading insights...</p>
      ) : !summary ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <p style={{ color: '#a1a1aa', marginBottom: '8px' }}>No weekly insights yet.</p>
          <p style={{ color: '#71717a', fontSize: '13px', margin: 0 }}>
            Generate your first summary after tagging some videos as winners or losers.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Winning Patterns */}
          <div style={{ backgroundColor: 'rgba(39, 39, 42, 0.5)', borderRadius: '8px', padding: '16px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 500, color: '#4ade80', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', marginTop: 0 }}>
              <TrendingUp size={16} />
              Winning Patterns
            </h4>
            {summary.winning_patterns?.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {summary.winning_patterns.map((p: any) => (
                  <span key={p.angle} style={{
                    padding: '4px 12px',
                    backgroundColor: 'rgba(34, 197, 94, 0.2)',
                    color: '#86efac',
                    borderRadius: '9999px',
                    fontSize: '13px',
                  }}>
                    {p.angle} (+{p.winners})
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ color: '#71717a', fontSize: '13px', margin: 0 }}>No winning patterns yet</p>
            )}
          </div>

          {/* Losing Patterns */}
          <div style={{ backgroundColor: 'rgba(39, 39, 42, 0.5)', borderRadius: '8px', padding: '16px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 500, color: '#f87171', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', marginTop: 0 }}>
              <TrendingDown size={16} />
              Losing Patterns
            </h4>
            {summary.losing_patterns?.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {summary.losing_patterns.map((p: any) => (
                  <span key={p.angle} style={{
                    padding: '4px 12px',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    color: '#fca5a5',
                    borderRadius: '9999px',
                    fontSize: '13px',
                  }}>
                    {p.angle} (-{p.losers + p.flagged})
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ color: '#71717a', fontSize: '13px', margin: 0 }}>No losing patterns yet</p>
            )}
          </div>

          {/* Suppression Warnings */}
          {summary.suppression_rules?.length > 0 && (
            <div style={{
              gridColumn: '1 / -1',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '8px',
              padding: '16px',
            }}>
              <h4 style={{ fontSize: '13px', fontWeight: 500, color: '#fbbf24', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', marginTop: 0 }}>
                <AlertTriangle size={16} />
                Patterns to Avoid
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {summary.suppression_rules.map((r: any) => (
                  <span key={r.pattern_id} style={{
                    padding: '4px 12px',
                    backgroundColor: 'rgba(245, 158, 11, 0.2)',
                    color: '#fcd34d',
                    borderRadius: '9999px',
                    fontSize: '13px',
                  }}>
                    {r.pattern_id}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Summary Stats */}
          <div style={{ gridColumn: '1 / -1', fontSize: '12px', color: '#71717a', marginTop: '8px' }}>
            Period: {summary.window?.start?.slice(0, 10)} to {summary.window?.end?.slice(0, 10)} &bull;{' '}
            {summary.totals?.feedback_events || 0} feedback events
          </div>
        </div>
      )}
    </div>
  );
}
function ClawbotMonthlyInsights() {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/clawbot/summaries/monthly', { credentials: 'include' });
      const json = await res.json();
      setSummary(json.summary);
    } catch (error) {
      console.error('Failed to load monthly summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateSummary = async () => {
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/clawbot/summaries/monthly', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Monthly summary generated!' });
        await loadSummary();
      } else {
        setMessage({ type: 'error', text: 'Failed to generate summary' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to generate summary' });
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  return (
    <div style={{
      backgroundColor: '#18181b',
      border: '1px solid #27272a',
      borderRadius: '8px',
      padding: '24px',
      marginBottom: '24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <TrendingUp size={20} style={{ color: '#3b82f6' }} />
          Clawbot Monthly Insights
        </h3>
        <button
          type="button"
          onClick={generateSummary}
          disabled={generating}
          style={{
            padding: '8px 16px',
            backgroundColor: generating ? '#1e40af' : '#3b82f6',
            color: '#fff',
            fontSize: '13px',
            border: 'none',
            borderRadius: '8px',
            cursor: generating ? 'not-allowed' : 'pointer',
            opacity: generating ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <RefreshCw size={14} style={generating ? { animation: 'spin 1s linear infinite' } : {}} />
          {generating ? 'Generating...' : summary ? 'Regenerate' : 'Generate Monthly'}
        </button>
      </div>

      {message && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '6px',
          marginBottom: '12px',
          fontSize: '13px',
          backgroundColor: message.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          color: message.type === 'success' ? '#4ade80' : '#f87171',
        }}>
          {message.text}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#a1a1aa', margin: 0 }}>Loading monthly insights...</p>
      ) : !summary ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <p style={{ color: '#a1a1aa', marginBottom: '8px' }}>No monthly insights yet.</p>
          <p style={{ color: '#71717a', fontSize: '13px', margin: 0 }}>
            Generate a monthly summary to see 30-day trends and patterns.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Top 5 Winning Angles */}
          <div style={{ backgroundColor: 'rgba(39, 39, 42, 0.5)', borderRadius: '8px', padding: '16px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 500, color: '#4ade80', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', marginTop: 0 }}>
              <TrendingUp size={16} />
              Top Winning Angles (30d)
            </h4>
            {summary.winning_patterns?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {summary.winning_patterns.slice(0, 5).map((p: any, i: number) => (
                  <div key={p.angle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: '#d4d4d8' }}>
                      {i + 1}. {p.angle}
                    </span>
                    <span style={{
                      padding: '2px 8px',
                      backgroundColor: 'rgba(34, 197, 94, 0.2)',
                      color: '#86efac',
                      borderRadius: '9999px',
                      fontSize: '11px',
                    }}>
                      +{p.winners} wins
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#71717a', fontSize: '13px', margin: 0 }}>No winning patterns yet</p>
            )}
          </div>

          {/* Top 5 Losing Angles */}
          <div style={{ backgroundColor: 'rgba(39, 39, 42, 0.5)', borderRadius: '8px', padding: '16px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 500, color: '#f87171', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', marginTop: 0 }}>
              <TrendingDown size={16} />
              Top Losing Angles (30d)
            </h4>
            {summary.losing_patterns?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {summary.losing_patterns.slice(0, 5).map((p: any, i: number) => (
                  <div key={p.angle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: '#d4d4d8' }}>
                      {i + 1}. {p.angle}
                    </span>
                    <span style={{
                      padding: '2px 8px',
                      backgroundColor: 'rgba(239, 68, 68, 0.2)',
                      color: '#fca5a5',
                      borderRadius: '9999px',
                      fontSize: '11px',
                    }}>
                      -{p.losers + p.flagged} losses
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#71717a', fontSize: '13px', margin: 0 }}>No losing patterns yet</p>
            )}
          </div>

          {/* Period Stats */}
          <div style={{ gridColumn: '1 / -1', fontSize: '12px', color: '#71717a', marginTop: '8px' }}>
            Period: {summary.window?.start?.slice(0, 10)} to {summary.window?.end?.slice(0, 10)} &bull;{' '}
            {summary.totals?.feedback_events || 0} feedback events &bull;{' '}
            {summary.totals?.unique_angles || 0} unique angles
          </div>
        </div>
      )}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
  const [activeTab, setActiveTab] = useState<'pipeline' | 'content' | 'winners'>('content');
  const [contentExporting, setContentExporting] = useState<string | null>(null);
  const [winnersData, setWinnersData] = useState<WinnersAnalytics | null>(null);
  const [winnersLoading, setWinnersLoading] = useState(false);

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
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  // Fetch winners analytics
  const fetchWinnersData = async (period: string) => {
    setWinnersLoading(true);
    try {
      const res = await fetch(`/api/analytics/winners?period=${period}`);
      const result = await res.json();
      if (result.ok) {
        setWinnersData(result.analytics);
      }
    } catch (err) {
      console.error('Failed to fetch winners analytics:', err);
    } finally {
      setWinnersLoading(false);
    }
  };

  // Fetch winners data when tab changes or window changes
  useEffect(() => {
    if (isAdmin && activeTab === 'winners') {
      const period = windowDays === 7 ? '7d' : windowDays === 14 ? '30d' : '30d';
      fetchWinnersData(period);
    }
  }, [isAdmin, activeTab, windowDays]);

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
    } catch {
      alert('Export error');
    } finally {
      setExporting(null);
    }
  };

  // Export content analytics CSV
  const exportContentCsv = async (type: 'scripts' | 'videos' | 'credits' | 'content-types' | 'all-scripts' | 'video-requests') => {
    setContentExporting(type);
    try {
      let url: string;
      let filename: string;

      if (type === 'all-scripts') {
        url = `/api/admin/export/scripts?days=${windowDays}`;
        filename = `scripts_export_${windowDays}d.csv`;
      } else if (type === 'video-requests') {
        url = `/api/admin/export/video-requests?days=${windowDays}`;
        filename = `video_requests_${windowDays}d.csv`;
      } else {
        url = `/api/admin/export/content-analytics?days=${windowDays}&type=${type}`;
        filename = `content_${type}_${windowDays}d.csv`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);
      } else {
        alert('Export failed');
      }
    } catch {
      alert('Export error');
    } finally {
      setContentExporting(null);
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
        <button type="button"
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
        <button type="button"
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
        <button type="button"
          onClick={() => setActiveTab('winners')}
          style={{
            padding: '12px 24px',
            backgroundColor: 'transparent',
            color: activeTab === 'winners' ? '#f59e0b' : '#6c757d',
            border: 'none',
            borderBottom: activeTab === 'winners' ? '2px solid #f59e0b' : '2px solid transparent',
            marginBottom: '-2px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'winners' ? 'bold' : 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Trophy size={16} />
          Winners Insights
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
          <button type="button"
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

      {/* Clawbot Weekly Insights */}
      <ClawbotWeeklyInsights />
      <ClawbotMonthlyInsights />

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

          {/* Export Buttons Row */}
          <div style={{
            marginBottom: '20px',
            padding: '16px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #dee2e6',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '14px', fontWeight: '500', color: '#495057' }}>
                Export Data
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button"
                  onClick={() => exportContentCsv('scripts')}
                  disabled={contentExporting === 'scripts'}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: contentExporting === 'scripts' ? '#adb5bd' : '#1971c2',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: contentExporting === 'scripts' ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                  }}
                >
                  {contentExporting === 'scripts' ? 'Exporting...' : 'Scripts by Day'}
                </button>
                <button type="button"
                  onClick={() => exportContentCsv('videos')}
                  disabled={contentExporting === 'videos'}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: contentExporting === 'videos' ? '#adb5bd' : '#2b8a3e',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: contentExporting === 'videos' ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                  }}
                >
                  {contentExporting === 'videos' ? 'Exporting...' : 'Videos by Day'}
                </button>
                <button type="button"
                  onClick={() => exportContentCsv('credits')}
                  disabled={contentExporting === 'credits'}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: contentExporting === 'credits' ? '#adb5bd' : '#e67700',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: contentExporting === 'credits' ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                  }}
                >
                  {contentExporting === 'credits' ? 'Exporting...' : 'Credit Usage'}
                </button>
                <button type="button"
                  onClick={() => exportContentCsv('content-types')}
                  disabled={contentExporting === 'content-types'}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: contentExporting === 'content-types' ? '#adb5bd' : '#862e9c',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: contentExporting === 'content-types' ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                  }}
                >
                  {contentExporting === 'content-types' ? 'Exporting...' : 'Content Types'}
                </button>
                <span style={{ borderLeft: '1px solid #dee2e6', margin: '0 4px' }} />
                <button type="button"
                  onClick={() => exportContentCsv('all-scripts')}
                  disabled={contentExporting === 'all-scripts'}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: contentExporting === 'all-scripts' ? '#adb5bd' : '#495057',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: contentExporting === 'all-scripts' ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                  }}
                >
                  {contentExporting === 'all-scripts' ? 'Exporting...' : 'All Scripts (Full)'}
                </button>
                <button type="button"
                  onClick={() => exportContentCsv('video-requests')}
                  disabled={contentExporting === 'video-requests'}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: contentExporting === 'video-requests' ? '#adb5bd' : '#495057',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: contentExporting === 'video-requests' ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                  }}
                >
                  {contentExporting === 'video-requests' ? 'Exporting...' : 'Video Requests'}
                </button>
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

      {/* Winners Insights Tab */}
      {activeTab === 'winners' && (
        <>
          {winnersLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
              Loading winners analytics...
            </div>
          ) : !winnersData || winnersData.overview.totalWinners === 0 ? (
            <WinnersEmptyState hasScripts={(contentData?.summary.total_scripts || 0) > 0} />
          ) : (
            <div className="space-y-6">
              {/* Overview Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Total Winners"
                  value={winnersData.overview.totalWinners}
                  subtext={`${winnersData.overview.winnersThisPeriod} this period`}
                  icon={Trophy}
                  iconColor="text-amber-400"
                />
                <StatCard
                  label="Win Rate"
                  value={`${winnersData.overview.winRate}%`}
                  subtext={`of ${winnersData.overview.totalScriptsGenerated} scripts`}
                  icon={Target}
                  iconColor="text-teal-400"
                />
                <StatCard
                  label="Avg Views"
                  value={winnersData.overview.avgWinnerViews.toLocaleString()}
                  subtext={`${winnersData.overview.totalViews.toLocaleString()} total`}
                  icon={Eye}
                  iconColor="text-blue-400"
                />
                <StatCard
                  label="Avg Engagement"
                  value={`${winnersData.overview.avgWinnerEngagement}%`}
                  subtext="across all winners"
                  icon={Percent}
                  iconColor="text-purple-400"
                />
              </div>

              {/* Trends Chart */}
              <TrendsChart data={winnersData.trends.scriptsOverTime} />

              {/* Top Performers Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TopPerformersCard
                  title="Top Hook Types"
                  items={winnersData.topPerformers.hookTypes.slice(0, 5).map((h, i) => ({
                    rank: i + 1,
                    label: h.label,
                    count: h.count,
                    metric: `${h.avgEngagement.toFixed(1)}% engagement`,
                  }))}
                  emptyMessage="No hook type data yet"
                />
                <TopPerformersCard
                  title="Top Content Formats"
                  items={winnersData.topPerformers.contentFormats.slice(0, 5).map((f, i) => ({
                    rank: i + 1,
                    label: f.label,
                    count: f.count,
                    metric: `${f.avgEngagement.toFixed(1)}% engagement`,
                  }))}
                  emptyMessage="No content format data yet"
                />
              </div>

              {/* Video Length & Recommendations Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <VideoLengthChart
                  shortest={winnersData.topPerformers.videoLengths.shortest}
                  longest={winnersData.topPerformers.videoLengths.longest}
                  avgWinning={winnersData.topPerformers.videoLengths.avgWinning}
                  sweetSpot={winnersData.topPerformers.videoLengths.sweetSpot}
                />
                <RecommendationCard recommendations={winnersData.recommendations} />
              </div>

              {/* Patterns Section */}
              {(winnersData.patterns.winning.length > 0 || winnersData.patterns.underperforming.length > 0) && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <h3 className="text-sm font-medium text-zinc-400 mb-4">Identified Patterns</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {winnersData.patterns.winning.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-emerald-400 mb-2 uppercase tracking-wide">
                          Winning Patterns
                        </h4>
                        <ul className="space-y-1">
                          {winnersData.patterns.winning.map((pattern, i) => (
                            <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                              <span className="text-emerald-400 mt-1">+</span>
                              {pattern}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {winnersData.patterns.underperforming.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-red-400 mb-2 uppercase tracking-wide">
                          Patterns to Avoid
                        </h4>
                        <ul className="space-y-1">
                          {winnersData.patterns.underperforming.map((pattern, i) => (
                            <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                              <span className="text-red-400 mt-1">-</span>
                              {pattern}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Link to Winners Bank */}
              <div className="text-center pt-4">
                <Link
                  href="/admin/winners-bank"
                  className="inline-flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors"
                >
                  View all winners in Winners Bank
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}
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
              <button type="button"
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
              <button type="button"
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
              <button type="button"
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
