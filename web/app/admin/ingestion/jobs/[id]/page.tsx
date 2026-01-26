'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useHydrated } from '@/lib/useHydrated';
import AdminPageLayout, { AdminCard, AdminButton, StatCard } from '../../../components/AdminPageLayout';
import {
  getIngestionJob,
  getReconciliationReport,
  performJobAction,
  generateCsv,
  downloadCsv,
  type IngestionJob,
  type ReconciliationReport,
  type JobStatus,
} from '@/lib/client/ingestion-client';

interface AuthUser {
  id: string;
  email: string | null;
  role: string | null;
}

const STATUS_COLORS: Record<JobStatus, { bg: string; text: string; border: string }> = {
  pending: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' },
  validated: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  committed: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  partial: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300' },
};

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;
  const hydrated = useHydrated();

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [job, setJob] = useState<IngestionJob | null>(null);
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionResult, setActionResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push(`/login?redirect=/admin/ingestion/jobs/${jobId}`);
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
        router.push(`/login?redirect=/admin/ingestion/jobs/${jobId}`);
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [router, jobId]);

  // Fetch job and report
  const fetchData = useCallback(async () => {
    if (!authUser) return;

    setLoading(true);
    setError('');

    // Fetch job details
    const jobResponse = await getIngestionJob(jobId, false);
    if (!jobResponse.ok || !jobResponse.data) {
      setError(jobResponse.error || 'Failed to load job');
      setLoading(false);
      return;
    }
    setJob(jobResponse.data.job);

    // Fetch reconciliation report
    const reportResponse = await getReconciliationReport(jobId);
    if (reportResponse.ok && reportResponse.data) {
      setReport(reportResponse.data.report);
    }

    setLoading(false);
  }, [authUser, jobId]);

  useEffect(() => {
    if (authUser) {
      fetchData();
    }
  }, [authUser, fetchData]);

  // Handle job actions
  const handleAction = useCallback(
    async (action: 'validate' | 'commit' | 'retry') => {
      setActionLoading(true);
      setActionResult(null);

      const response = await performJobAction(jobId, action);

      if (!response.ok) {
        setActionResult({ ok: false, message: response.error || 'Action failed' });
      } else {
        const verb = action === 'validate' ? 'Validated' : action === 'commit' ? 'Committed' : 'Retried';
        setActionResult({
          ok: true,
          message: `${verb} successfully. ${response.data?.committed_count || response.data?.validated_count || 0} rows processed.`,
        });
        // Refresh data
        await fetchData();
      }

      setActionLoading(false);
    },
    [jobId, fetchData]
  );

  // Download failed rows as CSV
  const handleDownloadFailed = useCallback(() => {
    if (!report || report.failed_rows.length === 0) return;

    const rows = report.failed_rows.map((row) => ({
      external_id: row.external_id,
      error: row.error,
      caption: (row.normalized_payload?.caption as string) || '',
      script_text: (row.normalized_payload?.script_text as string) || '',
      product_sku: (row.normalized_payload?.product_sku as string) || '',
    }));

    const csv = generateCsv(rows, ['external_id', 'error', 'caption', 'script_text', 'product_sku']);
    downloadCsv(csv, `failed_rows_${jobId.slice(0, 8)}.csv`);
  }, [report, jobId]);

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

  if (loading) {
    return (
      <AdminPageLayout title="Loading..." subtitle="Fetching job details">
        <div className="text-center py-12 text-slate-500">Loading job...</div>
      </AdminPageLayout>
    );
  }

  if (error || !job) {
    return (
      <AdminPageLayout title="Error" subtitle="Failed to load job">
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error || 'Job not found'}
        </div>
        <div className="mt-4">
          <Link href="/admin/ingestion/jobs" className="text-blue-600 hover:underline">
            ← Back to Jobs
          </Link>
        </div>
      </AdminPageLayout>
    );
  }

  const statusColor = STATUS_COLORS[job.status];
  const canValidate = job.status === 'pending';
  const canCommit = job.status === 'validated';
  const canRetry = job.status === 'failed' || job.status === 'partial';

  return (
    <AdminPageLayout
      title={`Job: ${job.id.slice(0, 8)}...`}
      subtitle={`${job.source} import`}
      headerActions={
        <Link href="/admin/ingestion/jobs">
          <AdminButton variant="secondary">← All Jobs</AdminButton>
        </Link>
      }
    >
      {/* Job Info */}
      <AdminCard title="Job Details">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <div className="text-xs text-slate-500 uppercase">Status</div>
            <span className={`inline-block mt-1 px-3 py-1 rounded text-sm font-medium ${statusColor.bg} ${statusColor.text}`}>
              {job.status}
            </span>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase">Source</div>
            <div className="mt-1 font-medium">{job.source}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase">Reference</div>
            <div className="mt-1 font-medium truncate" title={job.source_ref}>
              {job.source_ref}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase">Created</div>
            <div className="mt-1 text-sm">
              {hydrated ? new Date(job.created_at).toLocaleString() : job.created_at}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 mt-4">
          <div className="text-xs text-slate-500 uppercase mb-2">Job ID</div>
          <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono">{job.id}</code>
        </div>
      </AdminCard>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Rows" value={job.total_rows} />
        <StatCard label="Committed" value={job.success_count} variant="success" />
        <StatCard label="Failed" value={job.failure_count} variant="danger" />
        <StatCard label="Duplicates" value={job.duplicate_count} variant="warning" />
      </div>

      {/* Actions */}
      <AdminCard title="Actions">
        <div className="flex flex-wrap gap-3">
          {canValidate && (
            <AdminButton onClick={() => handleAction('validate')} disabled={actionLoading}>
              {actionLoading ? 'Processing...' : 'Validate'}
            </AdminButton>
          )}
          {canCommit && (
            <AdminButton onClick={() => handleAction('commit')} disabled={actionLoading}>
              {actionLoading ? 'Processing...' : 'Commit Validated Rows'}
            </AdminButton>
          )}
          {canRetry && (
            <AdminButton onClick={() => handleAction('retry')} disabled={actionLoading} variant="secondary">
              {actionLoading ? 'Processing...' : 'Retry Failed Rows'}
            </AdminButton>
          )}
          <AdminButton variant="secondary" onClick={fetchData} disabled={loading}>
            Refresh
          </AdminButton>
        </div>

        {actionResult && (
          <div
            className={`mt-4 p-3 rounded-md text-sm ${
              actionResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {actionResult.message}
          </div>
        )}

        {!canValidate && !canCommit && !canRetry && (
          <div className="text-sm text-slate-500 mt-2">
            No actions available for this job status.
          </div>
        )}
      </AdminCard>

      {/* Reconciliation Report */}
      {report && (
        <>
          {/* Committed Rows */}
          {report.committed_rows.length > 0 && (
            <AdminCard
              title={`Committed Rows (${report.committed_rows.length})`}
              subtitle="Successfully created videos"
              noPadding
            >
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-2 text-left font-medium text-slate-600">External ID</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-600">Video ID</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-600">Caption</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.committed_rows.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono text-xs">{row.external_id}</td>
                        <td className="px-4 py-2">
                          <Link
                            href={`/admin/pipeline/${row.video_id}`}
                            className="text-blue-600 hover:underline font-mono text-xs"
                          >
                            {row.video_id.slice(0, 8)}...
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-slate-600 truncate max-w-xs" title={row.caption}>
                          {row.caption || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AdminCard>
          )}

          {/* Failed Rows */}
          {report.failed_rows.length > 0 && (
            <AdminCard
              title={`Failed Rows (${report.failed_rows.length})`}
              subtitle="Rows that could not be processed"
              headerActions={
                <AdminButton variant="secondary" size="sm" onClick={handleDownloadFailed}>
                  Download CSV
                </AdminButton>
              }
              noPadding
            >
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-2 text-left font-medium text-slate-600">External ID</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-600">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.failed_rows.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-red-50">
                        <td className="px-4 py-2 font-mono text-xs">{row.external_id}</td>
                        <td className="px-4 py-2 text-red-600">{row.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AdminCard>
          )}

          {/* Duplicate Rows */}
          {report.duplicate_rows.length > 0 && (
            <AdminCard
              title={`Duplicate Rows (${report.duplicate_rows.length})`}
              subtitle="Already imported videos"
              noPadding
            >
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-2 text-left font-medium text-slate-600">External ID</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-600">Existing Video</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.duplicate_rows.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-amber-50">
                        <td className="px-4 py-2 font-mono text-xs">{row.external_id}</td>
                        <td className="px-4 py-2">
                          <Link
                            href={`/admin/pipeline/${row.existing_video_id}`}
                            className="text-blue-600 hover:underline font-mono text-xs"
                          >
                            {row.existing_video_id.slice(0, 8)}...
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AdminCard>
          )}

          {/* Error Summary */}
          {job.error_summary && job.error_summary.length > 0 && (
            <AdminCard title="Error Summary" subtitle="Grouped by error type">
              <div className="space-y-3">
                {job.error_summary.map((err, i) => (
                  <div key={i} className="p-3 bg-red-50 border border-red-100 rounded-md">
                    <div className="font-medium text-red-700">{err.error_type}</div>
                    <div className="text-sm text-red-600 mt-1">
                      {err.count} rows affected
                      {err.examples.length > 0 && (
                        <span className="text-slate-500 ml-2">
                          (e.g., {err.examples.slice(0, 3).join(', ')})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </AdminCard>
          )}

          {/* Empty state */}
          {report.committed_rows.length === 0 &&
            report.failed_rows.length === 0 &&
            report.duplicate_rows.length === 0 && (
              <AdminCard>
                <div className="text-center py-8 text-slate-500">
                  No reconciliation data available yet. Job may still be pending.
                </div>
              </AdminCard>
            )}
        </>
      )}
    </AdminPageLayout>
  );
}
