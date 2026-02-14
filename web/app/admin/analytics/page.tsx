'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import AdminPageLayout, { AdminCard, StatCard, AdminButton } from '../components/AdminPageLayout';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Download } from 'lucide-react';

const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#84cc16', '#64748b', '#f97316'];

interface PerformanceData {
  metrics: {
    total_videos: number;
    posted_this_week: number;
    avg_script_score: number;
    scripts_generated: number;
    videos_posted: number;
    throughput_pct: number;
  };
  scripts_by_day: { date: string; count: number }[];
  status_breakdown: { status: string; count: number }[];
  score_distribution: { range: string; count: number }[];
  top_personas: { name: string; count: number }[];
  credits_by_day: { date: string; amount: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  NEEDS_SCRIPT: 'Needs Script',
  GENERATING_SCRIPT: 'Generating',
  NOT_RECORDED: 'Not Recorded',
  AI_RENDERING: 'AI Rendering',
  READY_FOR_REVIEW: 'Ready for Review',
  RECORDED: 'Recorded',
  EDITED: 'Edited',
  APPROVED_NEEDS_EDITS: 'Approved',
  READY_TO_POST: 'Ready to Post',
  POSTED: 'Posted',
  REJECTED: 'Rejected',
};

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#e4e4e7',
};

export default function AnalyticsPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<PerformanceData | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
          router.push('/login?redirect=/admin/analytics');
          return;
        }
        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();
        if (roleData.role !== 'admin') {
          router.push('/admin/pipeline');
          return;
        }
        setIsAdmin(true);
      } catch {
        router.push('/login?redirect=/admin/analytics');
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/analytics/performance?days=${days}`);
      const json = await res.json();
      if (json.ok) {
        setData(json.data);
      } else {
        setError(json.error || 'Failed to load analytics');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [isAdmin, fetchData]);

  const exportCsv = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const lines: string[] = [];

      // Metrics summary
      lines.push('Metric,Value');
      lines.push(`Total Videos,${data.metrics.total_videos}`);
      lines.push(`Posted This Week,${data.metrics.posted_this_week}`);
      lines.push(`Avg Script Score,${data.metrics.avg_script_score}`);
      lines.push(`Scripts Generated,${data.metrics.scripts_generated}`);
      lines.push(`Videos Posted,${data.metrics.videos_posted}`);
      lines.push(`Throughput %,${data.metrics.throughput_pct}`);
      lines.push('');

      // Scripts by day
      lines.push('Date,Scripts Generated');
      for (const d of data.scripts_by_day) {
        lines.push(`${d.date},${d.count}`);
      }
      lines.push('');

      // Status breakdown
      lines.push('Status,Count');
      for (const s of data.status_breakdown) {
        lines.push(`${s.status},${s.count}`);
      }
      lines.push('');

      // Score distribution
      lines.push('Score,Count');
      for (const s of data.score_distribution) {
        lines.push(`${s.range},${s.count}`);
      }
      lines.push('');

      // Credits by day
      lines.push('Date,Credits Used');
      for (const c of data.credits_by_day) {
        lines.push(`${c.date},${c.amount}`);
      }

      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics_report_${days}d.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } finally {
      setExporting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <p className="text-zinc-500">Checking access...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <p className="text-zinc-500">Redirecting...</p>
      </div>
    );
  }

  const dateButtons = (
    <div className="flex items-center gap-2">
      {[
        { label: '7d', value: 7 },
        { label: '30d', value: 30 },
        { label: '90d', value: 90 },
        { label: 'All', value: 0 },
      ].map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setDays(opt.value)}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            days === opt.value
              ? 'bg-violet-600 text-white'
              : 'bg-zinc-800 text-zinc-400 border border-white/10 hover:bg-zinc-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
      <AdminButton variant="secondary" size="sm" onClick={exportCsv} disabled={exporting || !data}>
        <Download size={14} className="mr-1.5" />
        {exporting ? 'Exporting...' : 'Export'}
      </AdminButton>
    </div>
  );

  return (
    <AdminPageLayout
      title="Analytics"
      subtitle="Performance metrics and trends"
      showNav
      isAdmin={isAdmin}
      maxWidth="2xl"
      headerActions={dateButtons}
    >
      {loading && (
        <div className="py-20 text-center text-zinc-500">Loading analytics...</div>
      )}

      {error && !loading && (
        <AdminCard>
          <div className="py-12 text-center">
            <p className="text-red-400 mb-3">{error}</p>
            <AdminButton onClick={fetchData}>Retry</AdminButton>
          </div>
        </AdminCard>
      )}

      {!loading && !error && data && (
        <>
          {/* Top Metrics Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Videos"
              value={data.metrics.total_videos}
            />
            <StatCard
              label="Posted This Week"
              value={data.metrics.posted_this_week}
              variant="success"
            />
            <StatCard
              label="Avg Script Score"
              value={data.metrics.avg_script_score}
              trend={`out of 10`}
            />
            <StatCard
              label="Pipeline Throughput"
              value={`${data.metrics.throughput_pct}%`}
              trend={`${data.metrics.videos_posted} of ${data.metrics.scripts_generated} scripts`}
            />
          </div>

          {/* Charts Row 1: Scripts per Day + Video Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Scripts per Day Bar Chart */}
            <AdminCard title="Scripts Generated per Day">
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.scripts_by_day}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#71717a' }}
                      tickFormatter={(d) => d.slice(5)}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#71717a' }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={{ color: '#a1a1aa' }}
                      cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    />
                    <Bar dataKey="count" name="Scripts" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </AdminCard>

            {/* Video Status Pie Chart */}
            <AdminCard title="Video Status Breakdown">
              <div className="h-[280px]">
                {data.status_breakdown.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
                    No video data
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.status_breakdown}
                        dataKey="count"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        innerRadius={50}
                        paddingAngle={2}
                        label={(props) => {
                          const name = (props as { name?: string }).name || '';
                          return `${STATUS_LABELS[name] || name} (${props.value})`;
                        }}
                        labelLine={{ stroke: '#52525b' }}
                      >
                        {data.status_breakdown.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value: number, name: string) => [value, STATUS_LABELS[name] || name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </AdminCard>
          </div>

          {/* Charts Row 2: Score Distribution + Top Personas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Score Distribution Histogram */}
            <AdminCard title="Script Score Distribution" subtitle="AI quality scores (1-10)">
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.score_distribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="range"
                      tick={{ fontSize: 11, fill: '#71717a' }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#71717a' }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={{ color: '#a1a1aa' }}
                      labelFormatter={(label) => `Score: ${label}`}
                      cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    />
                    <Bar dataKey="count" name="Scripts" fill="#a855f7" radius={[4, 4, 0, 0]}>
                      {data.score_distribution.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={
                            parseInt(entry.range) >= 8
                              ? '#22c55e'
                              : parseInt(entry.range) >= 5
                              ? '#f59e0b'
                              : '#ef4444'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </AdminCard>

            {/* Top Personas Bar Chart */}
            <AdminCard title="Top Audience Personas" subtitle="By usage count">
              <div className="h-[280px]">
                {data.top_personas.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
                    No persona data
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.top_personas} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: '#71717a' }}
                        allowDecimals={false}
                      />
                      <YAxis
                        dataKey="name"
                        type="category"
                        tick={{ fontSize: 11, fill: '#a1a1aa' }}
                        width={120}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={{ color: '#a1a1aa' }}
                        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                      />
                      <Bar dataKey="count" name="Uses" fill="#06b6d4" radius={[0, 4, 4, 0]}>
                        {data.top_personas.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </AdminCard>
          </div>

          {/* Credits Usage Over Time */}
          <AdminCard title="Credit Usage Over Time" subtitle="Daily credit consumption">
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.credits_by_day}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#71717a' }}
                    tickFormatter={(d) => d.slice(5)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#71717a' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: '#a1a1aa' }}
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  />
                  <Bar dataKey="amount" name="Credits" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </AdminCard>
        </>
      )}
    </AdminPageLayout>
  );
}
