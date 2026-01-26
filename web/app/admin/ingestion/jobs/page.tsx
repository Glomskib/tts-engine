'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useHydrated, getTimeAgo } from '@/lib/useHydrated';
import AdminPageLayout, { AdminCard, AdminButton, StatCard } from '../../components/AdminPageLayout';
import {
  listIngestionJobs,
  type IngestionJob,
  type IngestionSource,
  type JobStatus,
} from '@/lib/client/ingestion-client';

interface AuthUser {
  id: string;
  email: string | null;
  role: string | null;
}

const STATUS_COLORS: Record<JobStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-slate-100', text: 'text-slate-700' },
  validated: { bg: 'bg-blue-100', text: 'text-blue-700' },
  committed: { bg: 'bg-green-100', text: 'text-green-700' },
  failed: { bg: 'bg-red-100', text: 'text-red-700' },
  partial: { bg: 'bg-amber-100', text: 'text-amber-700' },
};

const SOURCE_LABELS: Record<IngestionSource, string> = {
  tiktok_url: 'TikTok',
  csv: 'CSV',
  sheets: 'Sheets',
  monday: 'Monday',
  manual: 'Manual',
};

export default function IngestionJobsPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState<JobStatus | ''>('');
  const [sourceFilter, setSourceFilter] = useState<IngestionSource | ''>('');

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/ingestion/jobs');
          return;
        }

        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();

        if (roleData.role !== 'admin') {
          setAuthUser(null);
          setAuthLoading(false);
          return;
        }

        setAuthUser({
          id: user.id,
          email: user.email || null,
          role: roleData.role,
        });
      } catch (err) {
        console.error('Auth error:', err);
        router.push('/login?redirect=/admin/ingestion/jobs');
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // Fetch jobs
  const fetchJobs = useCallback(async () => {
    if (!authUser) return;

    setLoading(true);
    const response = await listIngestionJobs({
      status: statusFilter || undefined,
      source: sourceFilter || undefined,
      limit: 50,
    });

    if (response.ok && response.data) {
      setJobs(response.data.jobs);
      setTotal(response.data.total);
      setError('');
    } else {
      setError(response.error || 'Failed to load jobs');
    }
    setLoading(false);
  }, [authUser, statusFilter, sourceFilter]);

  useEffect(() => {
    if (authUser) {
      fetchJobs();
    }
  }, [authUser, fetchJobs]);

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Checking admin access...</div>
      </div>
    );
  }

  // Forbidden state
  if (!authUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Forbidden</h1>
          <p className="text-slate-600 mb-4">Admin access required.</p>
          <Link href="/admin/pipeline" className="text-blue-600 hover:underline">
            Go to Pipeline
          </Link>
        </div>
      </div>
    );
  }

  // Calculate summary stats
  const summaryStats = {
    total: jobs.length,
    committed: jobs.filter((j) => j.status === 'committed').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
    partial: jobs.filter((j) => j.status === 'partial').length,
    pending: jobs.filter((j) => j.status === 'pending' || j.status === 'validated').length,
  };

  return (
    <AdminPageLayout
      title="Ingestion Jobs"
      subtitle={`${total} total jobs`}
      headerActions={
        <div className="flex gap-2">
          <AdminButton variant="secondary" onClick={fetchJobs} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </AdminButton>
          <Link href="/admin/ingestion">
            <AdminButton>New Import</AdminButton>
          </Link>
        </div>
      }
    >
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total Jobs" value={summaryStats.total} />
        <StatCard label="Committed" value={summaryStats.committed} variant="success" />
        <StatCard label="Failed" value={summaryStats.failed} variant="danger" />
        <StatCard label="Partial" value={summaryStats.partial} variant="warning" />
        <StatCard label="Pending" value={summaryStats.pending} />
      </div>

      {/* Filters */}
      <AdminCard>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as JobStatus | '')}
              className="p-2 border border-slate-300 rounded-md text-sm min-w-[120px]"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="validated">Validated</option>
              <option value="committed">Committed</option>
              <option value="failed">Failed</option>
              <option value="partial">Partial</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Source</label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as IngestionSource | '')}
              className="p-2 border border-slate-300 rounded-md text-sm min-w-[120px]"
            >
              <option value="">All</option>
              <option value="tiktok_url">TikTok</option>
              <option value="csv">CSV</option>
              <option value="sheets">Sheets</option>
              <option value="monday">Monday</option>
              <option value="manual">Manual</option>
            </select>
          </div>
        </div>
      </AdminCard>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
        </div>
      )}

      {/* Jobs List */}
      <AdminCard noPadding>
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No jobs found.{' '}
            <Link href="/admin/ingestion" className="text-blue-600 hover:underline">
              Create one
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Source</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Reference</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-600">Rows</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-600">Success</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-600">Failed</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-600">Dups</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Created</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const statusColor = STATUS_COLORS[job.status];
                  return (
                    <tr key={job.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-slate-100 rounded text-xs font-medium">
                          {SOURCE_LABELS[job.source]}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate" title={job.source_ref}>
                        {job.source_ref}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${statusColor.bg} ${statusColor.text}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-medium">{job.total_rows}</td>
                      <td className="px-4 py-3 text-center text-green-600">{job.success_count}</td>
                      <td className="px-4 py-3 text-center text-red-600">{job.failure_count}</td>
                      <td className="px-4 py-3 text-center text-amber-600">{job.duplicate_count}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {hydrated ? getTimeAgo(job.created_at) : new Date(job.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/ingestion/jobs/${job.id}`}
                          className="text-blue-600 hover:underline text-sm"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </AdminPageLayout>
  );
}
