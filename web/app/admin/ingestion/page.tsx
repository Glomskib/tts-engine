'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import AdminPageLayout, { AdminCard, AdminButton } from '../components/AdminPageLayout';
import {
  ingestTikTokUrls,
  ingestCsvRows,
  parseCsv,
  type CsvRow,
  type ErrorSummaryEntry,
} from '@/lib/client/ingestion-client';

type Tab = 'tiktok' | 'csv';

interface AuthUser {
  id: string;
  email: string | null;
  role: string | null;
}

// CSV field mapping options
const CSV_FIELD_OPTIONS = [
  { value: '', label: '-- Skip --' },
  { value: 'external_id', label: 'External ID' },
  { value: 'caption', label: 'Caption' },
  { value: 'hashtags', label: 'Hashtags' },
  { value: 'product_sku', label: 'Product SKU' },
  { value: 'product_link', label: 'Product Link' },
  { value: 'script_text', label: 'Script Text' },
  { value: 'target_account', label: 'Target Account' },
];

export default function IngestionPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('tiktok');

  // TikTok state
  const [tiktokUrls, setTiktokUrls] = useState('');
  const [tiktokValidateOnly, setTiktokValidateOnly] = useState(false);
  const [tiktokLoading, setTiktokLoading] = useState(false);
  const [tiktokResult, setTiktokResult] = useState<{
    ok: boolean;
    jobId?: string;
    message?: string;
    errors?: ErrorSummaryEntry[];
    counts?: { validated: number; failed: number; duplicate: number; committed?: number };
  } | null>(null);

  // CSV state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [csvValidateOnly, setCsvValidateOnly] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvResult, setCsvResult] = useState<{
    ok: boolean;
    jobId?: string;
    message?: string;
    errors?: ErrorSummaryEntry[];
    counts?: { validated: number; failed: number; duplicate: number; committed?: number };
  } | null>(null);

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/ingestion');
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
        router.push('/login?redirect=/admin/ingestion');
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // Handle TikTok URL submission
  const handleTiktokSubmit = useCallback(async () => {
    const urls = tiktokUrls
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urls.length === 0) {
      setTiktokResult({ ok: false, message: 'Please enter at least one URL' });
      return;
    }

    setTiktokLoading(true);
    setTiktokResult(null);

    const response = await ingestTikTokUrls(urls, tiktokValidateOnly);

    if (!response.ok) {
      setTiktokResult({ ok: false, message: response.error || 'Failed to create job' });
    } else if (response.data) {
      setTiktokResult({
        ok: true,
        jobId: response.data.job_id,
        message: tiktokValidateOnly
          ? `Validated ${response.data.validated_count} of ${response.data.total_rows} rows`
          : `Committed ${response.data.committed_count || 0} videos`,
        errors: response.data.errors,
        counts: {
          validated: response.data.validated_count,
          failed: response.data.failed_count,
          duplicate: response.data.duplicate_count,
          committed: response.data.committed_count,
        },
      });
    }

    setTiktokLoading(false);
  }, [tiktokUrls, tiktokValidateOnly]);

  // Handle CSV file selection
  const handleCsvFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setCsvResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { headers, rows } = parseCsv(text);
      setCsvHeaders(headers);
      setCsvRows(rows);

      // Auto-map columns by name match
      const autoMapping: Record<string, string> = {};
      for (const header of headers) {
        const lowerHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const fieldOption = CSV_FIELD_OPTIONS.find(
          (opt) => opt.value && lowerHeader.includes(opt.value.replace('_', ''))
        );
        if (fieldOption) {
          autoMapping[header] = fieldOption.value;
        }
      }
      setCsvMapping(autoMapping);
    };
    reader.readAsText(file);
  }, []);

  // Handle CSV submission
  const handleCsvSubmit = useCallback(async () => {
    if (csvRows.length === 0) {
      setCsvResult({ ok: false, message: 'No rows to import' });
      return;
    }

    // Map CSV rows to ingestion format
    const mappedRows: CsvRow[] = csvRows.map((row) => {
      const mapped: CsvRow = {};
      for (const [csvHeader, fieldName] of Object.entries(csvMapping)) {
        if (fieldName && row[csvHeader]) {
          (mapped as Record<string, string>)[fieldName] = row[csvHeader];
        }
      }
      return mapped;
    });

    // Filter out empty rows
    const validRows = mappedRows.filter(
      (row) => row.caption || row.script_text || row.external_id
    );

    if (validRows.length === 0) {
      setCsvResult({ ok: false, message: 'No valid rows after mapping. Ensure caption or script_text is mapped.' });
      return;
    }

    setCsvLoading(true);
    setCsvResult(null);

    const response = await ingestCsvRows(
      csvFile?.name || 'csv_import',
      validRows,
      csvValidateOnly
    );

    if (!response.ok) {
      setCsvResult({ ok: false, message: response.error || 'Failed to create job' });
    } else if (response.data) {
      setCsvResult({
        ok: true,
        jobId: response.data.job_id,
        message: csvValidateOnly
          ? `Validated ${response.data.validated_count} of ${response.data.total_rows} rows`
          : `Committed ${response.data.committed_count || 0} videos`,
        errors: response.data.errors,
        counts: {
          validated: response.data.validated_count,
          failed: response.data.failed_count,
          duplicate: response.data.duplicate_count,
          committed: response.data.committed_count,
        },
      });
    }

    setCsvLoading(false);
  }, [csvRows, csvMapping, csvFile, csvValidateOnly]);

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
          <p className="text-slate-600 mb-4">Admin access required for ingestion.</p>
          <Link href="/admin/pipeline" className="text-blue-600 hover:underline">
            Go to Pipeline
          </Link>
        </div>
      </div>
    );
  }

  return (
    <AdminPageLayout
      title="Video Ingestion"
      subtitle="Import videos from TikTok URLs or CSV files"
      headerActions={
        <Link href="/admin/ingestion/jobs">
          <AdminButton variant="secondary">View All Jobs</AdminButton>
        </Link>
      }
    >
      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 mb-6">
        <button
          onClick={() => setActiveTab('tiktok')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'tiktok'
              ? 'border-slate-800 text-slate-800'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          TikTok URLs
        </button>
        <button
          onClick={() => setActiveTab('csv')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'csv'
              ? 'border-slate-800 text-slate-800'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          CSV Import
        </button>
      </div>

      {/* TikTok Tab */}
      {activeTab === 'tiktok' && (
        <AdminCard title="Import TikTok URLs" subtitle="Paste one URL per line">
          <div className="space-y-4">
            <textarea
              value={tiktokUrls}
              onChange={(e) => setTiktokUrls(e.target.value)}
              placeholder="https://www.tiktok.com/@user/video/123456789&#10;https://vm.tiktok.com/ABC123&#10;..."
              className="w-full h-48 p-3 border border-slate-300 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            />

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="tiktok-validate-only"
                checked={tiktokValidateOnly}
                onChange={(e) => setTiktokValidateOnly(e.target.checked)}
                className="rounded border-slate-300"
              />
              <label htmlFor="tiktok-validate-only" className="text-sm text-slate-600">
                Validate only (preview without committing)
              </label>
            </div>

            <div className="flex items-center gap-3">
              <AdminButton
                onClick={handleTiktokSubmit}
                disabled={tiktokLoading || !tiktokUrls.trim()}
              >
                {tiktokLoading ? 'Processing...' : tiktokValidateOnly ? 'Validate' : 'Import'}
              </AdminButton>
              <span className="text-sm text-slate-500">
                {tiktokUrls.split('\n').filter((u) => u.trim()).length} URLs
              </span>
            </div>

            {/* Result */}
            {tiktokResult && (
              <div
                className={`p-4 rounded-md ${
                  tiktokResult.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}
              >
                <div className={`font-medium ${tiktokResult.ok ? 'text-green-800' : 'text-red-800'}`}>
                  {tiktokResult.message}
                </div>

                {tiktokResult.counts && (
                  <div className="mt-2 flex gap-4 text-sm">
                    <span className="text-green-600">Validated: {tiktokResult.counts.validated}</span>
                    <span className="text-red-600">Failed: {tiktokResult.counts.failed}</span>
                    <span className="text-amber-600">Duplicates: {tiktokResult.counts.duplicate}</span>
                    {tiktokResult.counts.committed !== undefined && (
                      <span className="text-blue-600">Committed: {tiktokResult.counts.committed}</span>
                    )}
                  </div>
                )}

                {tiktokResult.errors && tiktokResult.errors.length > 0 && (
                  <div className="mt-3">
                    <div className="text-sm font-medium text-slate-700 mb-1">Errors:</div>
                    <ul className="text-sm text-red-700 list-disc list-inside">
                      {tiktokResult.errors.map((err, i) => (
                        <li key={i}>
                          {err.error_type} ({err.count} rows)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {tiktokResult.jobId && (
                  <div className="mt-3">
                    <Link
                      href={`/admin/ingestion/jobs/${tiktokResult.jobId}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      View Job Details →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </AdminCard>
      )}

      {/* CSV Tab */}
      {activeTab === 'csv' && (
        <div className="space-y-6">
          {/* File Upload */}
          <AdminCard title="Upload CSV File">
            <div className="space-y-4">
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvFileChange}
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
              />
              {csvFile && (
                <div className="text-sm text-slate-600">
                  Selected: {csvFile.name} ({csvRows.length} rows)
                </div>
              )}
            </div>
          </AdminCard>

          {/* Column Mapping */}
          {csvHeaders.length > 0 && (
            <AdminCard title="Map Columns" subtitle="Map CSV columns to ingestion fields">
              <div className="space-y-3">
                {csvHeaders.map((header) => (
                  <div key={header} className="flex items-center gap-4">
                    <div className="w-48 text-sm font-medium text-slate-700 truncate" title={header}>
                      {header}
                    </div>
                    <span className="text-slate-400">→</span>
                    <select
                      value={csvMapping[header] || ''}
                      onChange={(e) => setCsvMapping({ ...csvMapping, [header]: e.target.value })}
                      className="flex-1 p-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                    >
                      {CSV_FIELD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview */}
              {csvRows.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <div className="text-sm font-medium text-slate-700 mb-2">Preview (first 3 rows):</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50">
                          {Object.entries(csvMapping)
                            .filter(([, v]) => v)
                            .map(([h, v]) => (
                              <th key={h} className="border border-slate-200 px-2 py-1 text-left">
                                {v}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.slice(0, 3).map((row, i) => (
                          <tr key={i}>
                            {Object.entries(csvMapping)
                              .filter(([, v]) => v)
                              .map(([h]) => (
                                <td key={h} className="border border-slate-200 px-2 py-1 truncate max-w-xs">
                                  {row[h] || '-'}
                                </td>
                              ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </AdminCard>
          )}

          {/* Submit */}
          {csvRows.length > 0 && (
            <AdminCard>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="csv-validate-only"
                    checked={csvValidateOnly}
                    onChange={(e) => setCsvValidateOnly(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <label htmlFor="csv-validate-only" className="text-sm text-slate-600">
                    Validate only (preview without committing)
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <AdminButton onClick={handleCsvSubmit} disabled={csvLoading}>
                    {csvLoading ? 'Processing...' : csvValidateOnly ? 'Validate' : 'Import'}
                  </AdminButton>
                  <span className="text-sm text-slate-500">{csvRows.length} rows</span>
                </div>

                {/* Result */}
                {csvResult && (
                  <div
                    className={`p-4 rounded-md ${
                      csvResult.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                    }`}
                  >
                    <div className={`font-medium ${csvResult.ok ? 'text-green-800' : 'text-red-800'}`}>
                      {csvResult.message}
                    </div>

                    {csvResult.counts && (
                      <div className="mt-2 flex gap-4 text-sm">
                        <span className="text-green-600">Validated: {csvResult.counts.validated}</span>
                        <span className="text-red-600">Failed: {csvResult.counts.failed}</span>
                        <span className="text-amber-600">Duplicates: {csvResult.counts.duplicate}</span>
                        {csvResult.counts.committed !== undefined && (
                          <span className="text-blue-600">Committed: {csvResult.counts.committed}</span>
                        )}
                      </div>
                    )}

                    {csvResult.errors && csvResult.errors.length > 0 && (
                      <div className="mt-3">
                        <div className="text-sm font-medium text-slate-700 mb-1">Errors:</div>
                        <ul className="text-sm text-red-700 list-disc list-inside">
                          {csvResult.errors.map((err, i) => (
                            <li key={i}>
                              {err.error_type} ({err.count} rows)
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {csvResult.jobId && (
                      <div className="mt-3">
                        <Link
                          href={`/admin/ingestion/jobs/${csvResult.jobId}`}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          View Job Details →
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </AdminCard>
          )}
        </div>
      )}
    </AdminPageLayout>
  );
}
