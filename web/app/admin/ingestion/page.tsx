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

type Tab = 'tiktok' | 'csv' | 'winners';

// Types for winner imports
interface ImportedVideo {
  id: string;
  video_url: string;
  platform: string;
  platform_video_id?: string;
  title?: string;
  transcript?: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  engagement_rate?: number;
  creator_handle?: string;
  hook_line?: string;
  hook_style?: string;
  content_format?: string;
  comedy_style?: string;
  product_id?: string;
  product_mentioned?: string;
  ai_analysis?: Record<string, unknown>;
  status: 'pending' | 'processing' | 'analyzed' | 'error';
  error_message?: string;
  created_at: string;
  updated_at: string;
}

interface Product {
  id: string;
  name: string;
  brand?: string;
}

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
  const [tiktokProgress, setTiktokProgress] = useState<{ current: number; total: number } | null>(null);
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
  const [csvProgress, setCsvProgress] = useState<{ current: number; total: number } | null>(null);
  const [csvResult, setCsvResult] = useState<{
    ok: boolean;
    jobId?: string;
    message?: string;
    errors?: ErrorSummaryEntry[];
    counts?: { validated: number; failed: number; duplicate: number; committed?: number };
  } | null>(null);

  // Winners state
  const [winnerUrls, setWinnerUrls] = useState('');
  const [winnerImporting, setWinnerImporting] = useState(false);
  const [winnerImportResult, setWinnerImportResult] = useState<{
    ok: boolean;
    message: string;
    summary?: { imported: number; duplicates: number; failed: number };
  } | null>(null);
  const [importedVideos, setImportedVideos] = useState<ImportedVideo[]>([]);
  const [winnersLoading, setWinnersLoading] = useState(false);
  const [winnersFilter, setWinnersFilter] = useState<'all' | 'pending' | 'analyzed'>('all');
  const [products, setProducts] = useState<Product[]>([]);
  const [editingVideo, setEditingVideo] = useState<ImportedVideo | null>(null);
  const [editForm, setEditForm] = useState<{
    transcript: string;
    views: string;
    likes: string;
    comments: string;
    shares: string;
    creator_handle: string;
    hook_line: string;
    product_id: string;
  }>({
    transcript: '',
    views: '',
    likes: '',
    comments: '',
    shares: '',
    creator_handle: '',
    hook_line: '',
    product_id: '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

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
    setTiktokProgress(urls.length > 250 ? { current: 0, total: urls.length } : null);

    const response = await ingestTikTokUrls(urls, tiktokValidateOnly, (progress) => {
      setTiktokProgress({ current: progress.current, total: progress.total });
    });

    setTiktokProgress(null);

    if (!response.ok) {
      setTiktokResult({ ok: false, message: response.error || 'Failed to create job', jobId: response.data?.job_id });
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
    setCsvProgress(validRows.length > 250 ? { current: 0, total: validRows.length } : null);

    const response = await ingestCsvRows(
      csvFile?.name || 'csv_import',
      validRows,
      csvValidateOnly,
      (progress) => {
        setCsvProgress({ current: progress.current, total: progress.total });
      }
    );

    setCsvProgress(null);

    if (!response.ok) {
      setCsvResult({ ok: false, message: response.error || 'Failed to create job', jobId: response.data?.job_id });
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

  // Load products for winner import
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const res = await fetch('/api/products?limit=500');
        const data = await res.json();
        if (data.ok && data.data) {
          setProducts(data.data);
        }
      } catch (err) {
        console.error('Failed to load products:', err);
      }
    };
    if (activeTab === 'winners') {
      loadProducts();
    }
  }, [activeTab]);

  // Load imported videos
  const loadImportedVideos = useCallback(async () => {
    setWinnersLoading(true);
    try {
      const statusParam = winnersFilter === 'all' ? '' : `&status=${winnersFilter}`;
      const res = await fetch(`/api/videos/import?limit=100${statusParam}`);
      const data = await res.json();
      if (data.ok && data.data) {
        setImportedVideos(data.data);
      }
    } catch (err) {
      console.error('Failed to load imported videos:', err);
    } finally {
      setWinnersLoading(false);
    }
  }, [winnersFilter]);

  useEffect(() => {
    if (activeTab === 'winners') {
      loadImportedVideos();
    }
  }, [activeTab, loadImportedVideos]);

  // Handle winner URL import
  const handleWinnerImport = useCallback(async () => {
    const urls = winnerUrls
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urls.length === 0) {
      setWinnerImportResult({ ok: false, message: 'Please enter at least one URL' });
      return;
    }

    setWinnerImporting(true);
    setWinnerImportResult(null);

    try {
      const res = await fetch('/api/videos/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      const data = await res.json();

      if (data.ok) {
        setWinnerImportResult({
          ok: true,
          message: `Imported ${data.data.summary.imported} videos`,
          summary: data.data.summary,
        });
        setWinnerUrls('');
        loadImportedVideos();
      } else {
        setWinnerImportResult({
          ok: false,
          message: data.error || 'Import failed',
        });
      }
    } catch (err) {
      setWinnerImportResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Import failed',
      });
    } finally {
      setWinnerImporting(false);
    }
  }, [winnerUrls, loadImportedVideos]);

  // Open edit form for a video
  const openEditForm = (video: ImportedVideo) => {
    setEditingVideo(video);
    setEditForm({
      transcript: video.transcript || '',
      views: video.views?.toString() || '',
      likes: video.likes?.toString() || '',
      comments: video.comments?.toString() || '',
      shares: video.shares?.toString() || '',
      creator_handle: video.creator_handle || '',
      hook_line: video.hook_line || '',
      product_id: video.product_id || '',
    });
  };

  // Save video edits
  const handleSaveVideo = useCallback(async () => {
    if (!editingVideo) return;

    setEditSaving(true);
    try {
      const updates: Record<string, unknown> = {
        transcript: editForm.transcript || null,
        views: editForm.views ? parseInt(editForm.views, 10) : null,
        likes: editForm.likes ? parseInt(editForm.likes, 10) : null,
        comments: editForm.comments ? parseInt(editForm.comments, 10) : null,
        shares: editForm.shares ? parseInt(editForm.shares, 10) : null,
        creator_handle: editForm.creator_handle || null,
        hook_line: editForm.hook_line || null,
        product_id: editForm.product_id || null,
      };

      // If we have transcript and hook_line, mark as analyzed
      if (editForm.transcript && editForm.hook_line) {
        updates.status = 'analyzed';
      }

      const res = await fetch(`/api/videos/import/${editingVideo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        setEditingVideo(null);
        loadImportedVideos();
      }
    } catch (err) {
      console.error('Failed to save video:', err);
    } finally {
      setEditSaving(false);
    }
  }, [editingVideo, editForm, loadImportedVideos]);

  // Analyze video with AI
  const handleAnalyzeVideo = useCallback(async () => {
    if (!editingVideo || !editForm.transcript) return;

    setAnalyzing(true);
    try {
      const res = await fetch('/api/ai/analyze-winner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: editForm.transcript,
          metrics: {
            views: editForm.views ? parseInt(editForm.views, 10) : undefined,
            likes: editForm.likes ? parseInt(editForm.likes, 10) : undefined,
            comments: editForm.comments ? parseInt(editForm.comments, 10) : undefined,
            shares: editForm.shares ? parseInt(editForm.shares, 10) : undefined,
          },
          creator_handle: editForm.creator_handle,
        }),
      });

      const data = await res.json();
      if (data.ok && data.data?.analysis) {
        const analysis = data.data.analysis;
        // Update form with extracted data
        setEditForm((prev) => ({
          ...prev,
          hook_line: analysis.hook_line || prev.hook_line,
        }));

        // Save the full analysis to the video
        await fetch(`/api/videos/import/${editingVideo.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hook_line: analysis.hook_line,
            hook_style: analysis.hook_style,
            content_format: analysis.content_format,
            comedy_style: analysis.comedy_style,
            ai_analysis: analysis,
            status: 'analyzed',
          }),
        });

        loadImportedVideos();
      }
    } catch (err) {
      console.error('Failed to analyze video:', err);
    } finally {
      setAnalyzing(false);
    }
  }, [editingVideo, editForm, loadImportedVideos]);

  // Delete imported video
  const handleDeleteVideo = useCallback(async (id: string) => {
    if (!confirm('Delete this imported video?')) return;

    try {
      const res = await fetch(`/api/videos/import/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadImportedVideos();
      }
    } catch (err) {
      console.error('Failed to delete video:', err);
    }
  }, [loadImportedVideos]);

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400">Checking admin access...</div>
      </div>
    );
  }

  // Forbidden state
  if (!authUser) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-2">Forbidden</h1>
          <p className="text-zinc-400 mb-4">Admin access required for ingestion.</p>
          <Link href="/admin/pipeline" className="text-violet-400 hover:underline">
            Go to Work Queue
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
      <div className="flex border-b border-white/10 mb-6">
        <button type="button"
          onClick={() => setActiveTab('tiktok')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'tiktok'
              ? 'border-violet-500 text-zinc-100'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          TikTok URLs
        </button>
        <button type="button"
          onClick={() => setActiveTab('csv')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'csv'
              ? 'border-violet-500 text-zinc-100'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          CSV Import
        </button>
        <button type="button"
          onClick={() => setActiveTab('winners')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'winners'
              ? 'border-violet-500 text-zinc-100'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Import Winners
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
              className="w-full h-48 p-3 bg-zinc-800 border border-white/10 rounded-md font-mono text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="tiktok-validate-only"
                checked={tiktokValidateOnly}
                onChange={(e) => setTiktokValidateOnly(e.target.checked)}
                className="rounded border-white/10 bg-zinc-800"
              />
              <label htmlFor="tiktok-validate-only" className="text-sm text-zinc-400">
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
              <span className="text-sm text-zinc-400">
                {tiktokUrls.split('\n').filter((u) => u.trim()).length} URLs
                {tiktokUrls.split('\n').filter((u) => u.trim()).length > 250 && (
                  <span className="text-zinc-500 ml-1">(will be chunked)</span>
                )}
              </span>
            </div>

            {/* Progress indicator for chunked uploads */}
            {tiktokProgress && (
              <div className="space-y-1">
                <div className="flex justify-between text-sm text-zinc-400">
                  <span>Uploading chunks...</span>
                  <span>{tiktokProgress.current} / {tiktokProgress.total}</span>
                </div>
                <div className="w-full h-2 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 transition-all duration-300"
                    style={{ width: `${(tiktokProgress.current / tiktokProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Result */}
            {tiktokResult && (
              <div
                className={`p-4 rounded-md ${
                  tiktokResult.ok ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'
                }`}
              >
                <div className={`font-medium ${tiktokResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                  {tiktokResult.message}
                </div>

                {tiktokResult.counts && (
                  <div className="mt-2 flex gap-4 text-sm">
                    <span className="text-green-400">Validated: {tiktokResult.counts.validated}</span>
                    <span className="text-red-400">Failed: {tiktokResult.counts.failed}</span>
                    <span className="text-amber-400">Duplicates: {tiktokResult.counts.duplicate}</span>
                    {tiktokResult.counts.committed !== undefined && (
                      <span className="text-blue-400">Committed: {tiktokResult.counts.committed}</span>
                    )}
                  </div>
                )}

                {tiktokResult.errors && tiktokResult.errors.length > 0 && (
                  <div className="mt-3">
                    <div className="text-sm font-medium text-zinc-300 mb-1">Errors:</div>
                    <ul className="text-sm text-red-400 list-disc list-inside">
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
                      className="text-sm text-violet-400 hover:underline"
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
                className="block w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-zinc-700 file:text-zinc-200 hover:file:bg-zinc-600"
              />
              {csvFile && (
                <div className="text-sm text-zinc-400">
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
                    <div className="w-48 text-sm font-medium text-zinc-300 truncate" title={header}>
                      {header}
                    </div>
                    <span className="text-zinc-500">→</span>
                    <select
                      value={csvMapping[header] || ''}
                      onChange={(e) => setCsvMapping({ ...csvMapping, [header]: e.target.value })}
                      className="flex-1 p-2 bg-zinc-800 border border-white/10 rounded-md text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
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
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="text-sm font-medium text-zinc-300 mb-2">Preview (first 3 rows):</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-zinc-800/50">
                          {Object.entries(csvMapping)
                            .filter(([, v]) => v)
                            .map(([h, v]) => (
                              <th key={h} className="border border-white/10 px-2 py-1 text-left text-zinc-300">
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
                                <td key={h} className="border border-white/10 px-2 py-1 truncate max-w-xs text-zinc-400">
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
                    className="rounded border-white/10 bg-zinc-800"
                  />
                  <label htmlFor="csv-validate-only" className="text-sm text-zinc-400">
                    Validate only (preview without committing)
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <AdminButton onClick={handleCsvSubmit} disabled={csvLoading}>
                    {csvLoading ? 'Processing...' : csvValidateOnly ? 'Validate' : 'Import'}
                  </AdminButton>
                  <span className="text-sm text-zinc-400">
                    {csvRows.length} rows
                    {csvRows.length > 250 && (
                      <span className="text-zinc-500 ml-1">(will be chunked)</span>
                    )}
                  </span>
                </div>

                {/* Progress indicator for chunked uploads */}
                {csvProgress && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm text-zinc-400">
                      <span>Uploading chunks...</span>
                      <span>{csvProgress.current} / {csvProgress.total}</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-500 transition-all duration-300"
                        style={{ width: `${(csvProgress.current / csvProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Result */}
                {csvResult && (
                  <div
                    className={`p-4 rounded-md ${
                      csvResult.ok ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'
                    }`}
                  >
                    <div className={`font-medium ${csvResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                      {csvResult.message}
                    </div>

                    {csvResult.counts && (
                      <div className="mt-2 flex gap-4 text-sm">
                        <span className="text-green-400">Validated: {csvResult.counts.validated}</span>
                        <span className="text-red-400">Failed: {csvResult.counts.failed}</span>
                        <span className="text-amber-400">Duplicates: {csvResult.counts.duplicate}</span>
                        {csvResult.counts.committed !== undefined && (
                          <span className="text-blue-400">Committed: {csvResult.counts.committed}</span>
                        )}
                      </div>
                    )}

                    {csvResult.errors && csvResult.errors.length > 0 && (
                      <div className="mt-3">
                        <div className="text-sm font-medium text-zinc-300 mb-1">Errors:</div>
                        <ul className="text-sm text-red-400 list-disc list-inside">
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
                          className="text-sm text-violet-400 hover:underline"
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

      {/* Winners Tab */}
      {activeTab === 'winners' && (
        <div className="space-y-6">
          {/* Import URLs */}
          <AdminCard title="Import Winning TikTok Videos" subtitle="Paste TikTok URLs (one per line) to import for AI learning">
            <div className="space-y-4">
              <textarea
                value={winnerUrls}
                onChange={(e) => setWinnerUrls(e.target.value)}
                placeholder="https://www.tiktok.com/@creator/video/123456789&#10;https://vm.tiktok.com/ABC123&#10;..."
                className="w-full h-32 p-3 bg-zinc-800 border border-white/10 rounded-md font-mono text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />

              <div className="flex items-center gap-3">
                <AdminButton
                  onClick={handleWinnerImport}
                  disabled={winnerImporting || !winnerUrls.trim()}
                >
                  {winnerImporting ? 'Importing...' : 'Import URLs'}
                </AdminButton>
                <span className="text-sm text-zinc-400">
                  {winnerUrls.split('\n').filter((u) => u.trim()).length} URLs
                </span>
              </div>

              {winnerImportResult && (
                <div
                  className={`p-4 rounded-md ${
                    winnerImportResult.ok
                      ? 'bg-green-500/10 border border-green-500/20'
                      : 'bg-red-500/10 border border-red-500/20'
                  }`}
                >
                  <div className={`font-medium ${winnerImportResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                    {winnerImportResult.message}
                  </div>
                  {winnerImportResult.summary && (
                    <div className="mt-2 flex gap-4 text-sm">
                      <span className="text-green-400">Imported: {winnerImportResult.summary.imported}</span>
                      <span className="text-amber-400">Duplicates: {winnerImportResult.summary.duplicates}</span>
                      <span className="text-red-400">Failed: {winnerImportResult.summary.failed}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </AdminCard>

          {/* Filter and List */}
          <AdminCard
            title="Imported Videos"
            subtitle={`${importedVideos.length} videos`}
            headerActions={
              <div className="flex items-center gap-2">
                <select
                  value={winnersFilter}
                  onChange={(e) => setWinnersFilter(e.target.value as 'all' | 'pending' | 'analyzed')}
                  className="px-3 py-1 text-sm bg-zinc-800 border border-white/10 rounded-md text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="analyzed">Analyzed</option>
                </select>
                <AdminButton variant="secondary" onClick={loadImportedVideos}>
                  Refresh
                </AdminButton>
              </div>
            }
          >
            {winnersLoading ? (
              <div className="text-center py-8 text-zinc-400">Loading...</div>
            ) : importedVideos.length === 0 ? (
              <div className="text-center py-8 text-zinc-400">
                No imported videos. Add URLs above to get started.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-2 px-3 font-medium text-zinc-400">Video</th>
                      <th className="text-left py-2 px-3 font-medium text-zinc-400">Hook</th>
                      <th className="text-right py-2 px-3 font-medium text-zinc-400">Views</th>
                      <th className="text-right py-2 px-3 font-medium text-zinc-400">Engagement</th>
                      <th className="text-left py-2 px-3 font-medium text-zinc-400">Status</th>
                      <th className="text-left py-2 px-3 font-medium text-zinc-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importedVideos.map((video) => (
                      <tr key={video.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-2 px-3">
                          <a
                            href={video.video_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-violet-400 hover:underline truncate block max-w-[200px]"
                            title={video.video_url}
                          >
                            {video.creator_handle ? `@${video.creator_handle}` : video.platform_video_id || 'View'}
                          </a>
                        </td>
                        <td className="py-2 px-3">
                          <span className="truncate block max-w-[250px] text-zinc-300" title={video.hook_line || ''}>
                            {video.hook_line || <span className="text-zinc-500 italic">Not set</span>}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-zinc-300">
                          {video.views?.toLocaleString() || '-'}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-zinc-300">
                          {video.engagement_rate
                            ? `${(video.engagement_rate * 100).toFixed(2)}%`
                            : '-'}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                              video.status === 'analyzed'
                                ? 'bg-green-500/20 text-green-400'
                                : video.status === 'error'
                                ? 'bg-red-500/20 text-red-400'
                                : video.status === 'processing'
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-amber-500/20 text-amber-400'
                            }`}
                          >
                            {video.status}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <button type="button"
                              onClick={() => openEditForm(video)}
                              className="text-sm text-violet-400 hover:underline"
                            >
                              Edit
                            </button>
                            <button type="button"
                              onClick={() => handleDeleteVideo(video.id)}
                              className="text-sm text-red-400 hover:underline"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminCard>

          {/* Edit Modal */}
          {editingVideo && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div
                className="bg-zinc-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-white/10"
                onKeyDown={(e) => e.key === 'Escape' && setEditingVideo(null)}
              >
                <div className="p-6 border-b border-white/10">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-zinc-100">Edit Video Data</h3>
                    <button type="button"
                      onClick={() => setEditingVideo(null)}
                      className="text-zinc-400 hover:text-zinc-200"
                    >
                      ✕
                    </button>
                  </div>
                  <a
                    href={editingVideo.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-violet-400 hover:underline mt-1 block"
                  >
                    {editingVideo.video_url} ↗
                  </a>
                </div>

                <div className="p-6 space-y-4">
                  {/* Transcript */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">
                      Transcript <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      value={editForm.transcript}
                      onChange={(e) => setEditForm({ ...editForm, transcript: e.target.value })}
                      placeholder="Paste the video transcript here..."
                      className="w-full h-32 p-3 bg-zinc-800 border border-white/10 rounded-md text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>

                  {/* Metrics Row */}
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1">Views</label>
                      <input
                        type="number"
                        value={editForm.views}
                        onChange={(e) => setEditForm({ ...editForm, views: e.target.value })}
                        placeholder="0"
                        className="w-full p-2 bg-zinc-800 border border-white/10 rounded-md text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1">Likes</label>
                      <input
                        type="number"
                        value={editForm.likes}
                        onChange={(e) => setEditForm({ ...editForm, likes: e.target.value })}
                        placeholder="0"
                        className="w-full p-2 bg-zinc-800 border border-white/10 rounded-md text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1">Comments</label>
                      <input
                        type="number"
                        value={editForm.comments}
                        onChange={(e) => setEditForm({ ...editForm, comments: e.target.value })}
                        placeholder="0"
                        className="w-full p-2 bg-zinc-800 border border-white/10 rounded-md text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1">Shares</label>
                      <input
                        type="number"
                        value={editForm.shares}
                        onChange={(e) => setEditForm({ ...editForm, shares: e.target.value })}
                        placeholder="0"
                        className="w-full p-2 bg-zinc-800 border border-white/10 rounded-md text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                  </div>

                  {/* Creator and Hook */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1">Creator Handle</label>
                      <input
                        type="text"
                        value={editForm.creator_handle}
                        onChange={(e) => setEditForm({ ...editForm, creator_handle: e.target.value })}
                        placeholder="@username"
                        className="w-full p-2 bg-zinc-800 border border-white/10 rounded-md text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1">Product</label>
                      <select
                        value={editForm.product_id}
                        onChange={(e) => setEditForm({ ...editForm, product_id: e.target.value })}
                        className="w-full p-2 bg-zinc-800 border border-white/10 rounded-md text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      >
                        <option value="">-- Select Product --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.brand ? `(${p.brand})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Hook Line */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">
                      Hook Line <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={editForm.hook_line}
                      onChange={(e) => setEditForm({ ...editForm, hook_line: e.target.value })}
                      placeholder="First 1-2 sentences that grab attention"
                      className="w-full p-2 bg-zinc-800 border border-white/10 rounded-md text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>

                  {/* AI Analysis (if available) */}
                  {editingVideo.ai_analysis && (
                    <div className="p-3 bg-zinc-800/50 rounded-md border border-white/10">
                      <div className="text-sm font-medium text-zinc-300 mb-2">AI Analysis</div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-zinc-400">Hook Style:</span>{' '}
                          <span className="font-medium text-zinc-200">{editingVideo.hook_style || '-'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400">Content Format:</span>{' '}
                          <span className="font-medium text-zinc-200">{editingVideo.content_format || '-'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400">Comedy Style:</span>{' '}
                          <span className="font-medium text-zinc-200">{editingVideo.comedy_style || '-'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-6 border-t border-white/10 flex items-center justify-between">
                  <AdminButton
                    variant="secondary"
                    onClick={handleAnalyzeVideo}
                    disabled={analyzing || !editForm.transcript}
                  >
                    {analyzing ? 'Analyzing...' : 'Analyze with AI'}
                  </AdminButton>

                  <div className="flex items-center gap-3">
                    <AdminButton variant="secondary" onClick={() => setEditingVideo(null)}>
                      Cancel
                    </AdminButton>
                    <AdminButton onClick={handleSaveVideo} disabled={editSaving}>
                      {editSaving ? 'Saving...' : 'Save'}
                    </AdminButton>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AdminPageLayout>
  );
}
