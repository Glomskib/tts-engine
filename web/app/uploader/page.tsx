'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useHydrated, getTimeAgo } from '@/lib/useHydrated';

interface AuthUser {
  id: string;
  email: string | null;
  role: string | null;
}

interface UploaderVideo {
  video_id: string;
  status: string;
  created_at: string;
  product_sku: string | null;
  product_link: string | null;
  caption: string | null;
  hashtags: string[] | null;
  compliance_notes: string | null;
  target_account: string | null;
  uploader_checklist_completed_at: string | null;
  final_mp4_uri: string | null;
  thumbnail_uri: string | null;
  has_locked_script: boolean;
  posting_meta_complete: boolean;
  has_final_mp4: boolean;
  missing_fields: string[];
}

interface QueueResponse {
  ok: boolean;
  data?: {
    videos: UploaderVideo[];
    total: number;
    limit: number;
    offset: number;
    filters: {
      status: string;
      target_account: string | null;
      missing_only: boolean;
    };
    available_target_accounts: string[];
  };
  error?: string;
}

const STATUS_OPTIONS = [
  { value: 'ready_to_post', label: 'Ready to Post' },
  { value: 'needs_edit', label: 'Needs Edit' },
];

export default function UploaderPage() {
  const router = useRouter();
  const hydrated = useHydrated();

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const [videos, setVideos] = useState<UploaderVideo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ready_to_post' | 'needs_edit'>('ready_to_post');
  const [targetAccountFilter, setTargetAccountFilter] = useState<string>('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [availableTargetAccounts, setAvailableTargetAccounts] = useState<string[]>([]);

  // Actions
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/uploader');
          return;
        }

        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();

        // Check if user is admin or uploader
        if (roleData.role !== 'admin' && roleData.role !== 'uploader') {
          setAccessDenied(true);
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
        router.push('/login?redirect=/uploader');
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // Fetch queue
  const fetchQueue = useCallback(async () => {
    if (!authUser) return;

    setLoading(true);
    setError('');

    const params = new URLSearchParams();
    params.set('status', statusFilter);
    if (targetAccountFilter) {
      params.set('target_account', targetAccountFilter);
    }
    if (missingOnly) {
      params.set('missing_only', 'true');
    }
    params.set('limit', '200');

    try {
      const res = await fetch(`/api/uploader/queue?${params}`);
      const data: QueueResponse = await res.json();

      if (!data.ok || !data.data) {
        setError(data.error || 'Failed to load queue');
        setVideos([]);
        setTotal(0);
      } else {
        setVideos(data.data.videos);
        setTotal(data.data.total);
        setAvailableTargetAccounts(data.data.available_target_accounts);
      }
    } catch (err) {
      setError('Failed to fetch queue');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [authUser, statusFilter, targetAccountFilter, missingOnly]);

  useEffect(() => {
    if (authUser) {
      fetchQueue();
    }
  }, [authUser, fetchQueue]);

  // Mark checklist complete
  const handleMarkChecklistComplete = useCallback(async (videoId: string) => {
    setActionLoading(videoId);
    try {
      const res = await fetch(`/api/videos/${videoId}/posting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploader_checklist_completed_at: new Date().toISOString(),
        }),
      });
      const data = await res.json();

      if (data.ok) {
        // Update local state
        setVideos((prev) =>
          prev.map((v) =>
            v.video_id === videoId
              ? { ...v, uploader_checklist_completed_at: new Date().toISOString() }
              : v
          )
        );
      } else {
        alert(data.error || 'Failed to update checklist');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to update checklist');
    } finally {
      setActionLoading(null);
    }
  }, []);

  // Export CSV
  const handleExportCsv = useCallback(() => {
    if (videos.length === 0) return;

    const headers = [
      'video_id',
      'target_account',
      'product_sku',
      'product_link',
      'caption',
      'hashtags',
      'final_mp4_uri',
      'compliance_notes',
      'missing_fields',
    ];

    const escapeField = (value: string | null | undefined): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = videos.map((v) => [
      v.video_id,
      v.target_account || '',
      v.product_sku || '',
      v.product_link || '',
      v.caption || '',
      (v.hashtags || []).join(' '),
      v.final_mp4_uri || '',
      v.compliance_notes || '',
      v.missing_fields.join('; '),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map(escapeField).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `uploader_queue_${statusFilter}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [videos, statusFilter]);

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Checking access...</div>
      </div>
    );
  }

  // Access denied
  if (accessDenied) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h1>
          <p className="text-slate-600 mb-4">Uploader or admin access required.</p>
          <Link href="/" className="text-blue-600 hover:underline">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  // Count stats
  const readyCount = videos.filter((v) => v.posting_meta_complete && v.has_locked_script).length;
  const missingScriptCount = videos.filter((v) => !v.has_locked_script).length;
  const missingMp4Count = videos.filter((v) => !v.has_final_mp4).length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Uploader Console</h1>
            <p className="text-sm text-slate-500">Daily posting queue</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">{authUser?.email}</span>
            <Link href="/admin/pipeline" className="text-sm text-blue-600 hover:underline">
              Pipeline
            </Link>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-2xl font-bold text-slate-800">{total}</div>
            <div className="text-sm text-slate-500">Total Videos</div>
          </div>
          <div className="bg-white rounded-lg border border-green-200 p-4">
            <div className="text-2xl font-bold text-green-600">{readyCount}</div>
            <div className="text-sm text-slate-500">Ready to Post</div>
          </div>
          <div className="bg-white rounded-lg border border-amber-200 p-4">
            <div className="text-2xl font-bold text-amber-600">{missingScriptCount}</div>
            <div className="text-sm text-slate-500">Missing Script</div>
          </div>
          <div className="bg-white rounded-lg border border-red-200 p-4">
            <div className="text-2xl font-bold text-red-600">{missingMp4Count}</div>
            <div className="text-sm text-slate-500">Missing MP4</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ready_to_post' | 'needs_edit')}
                className="p-2 border border-slate-300 rounded-md text-sm min-w-[150px]"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Target Account</label>
              <select
                value={targetAccountFilter}
                onChange={(e) => setTargetAccountFilter(e.target.value)}
                className="p-2 border border-slate-300 rounded-md text-sm min-w-[150px]"
              >
                <option value="">All Accounts</option>
                {availableTargetAccounts.map((acct) => (
                  <option key={acct} value={acct}>
                    {acct}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="missing-only"
                checked={missingOnly}
                onChange={(e) => setMissingOnly(e.target.checked)}
                className="rounded border-slate-300"
              />
              <label htmlFor="missing-only" className="text-sm text-slate-600">
                Missing fields only
              </label>
            </div>

            <div className="ml-auto flex items-center gap-3 pt-5">
              <button
                onClick={fetchQueue}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
              <button
                onClick={handleExportCsv}
                disabled={videos.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-slate-800 rounded-md hover:bg-slate-700 disabled:opacity-50"
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 mb-6 bg-red-50 border border-red-200 rounded-md text-red-700">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading queue...</div>
          ) : videos.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No videos found with current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Video</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Target</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Product</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Caption</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-600">Script</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-600">MP4</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-600">Ready</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Missing</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {videos.map((video) => (
                    <tr key={video.video_id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/pipeline/${video.video_id}`}
                          className="font-mono text-xs text-blue-600 hover:underline"
                        >
                          {video.video_id.slice(0, 8)}...
                        </Link>
                        <div className="text-xs text-slate-400">
                          {hydrated ? getTimeAgo(video.created_at) : video.created_at.split('T')[0]}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {video.target_account ? (
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                            {video.target_account}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium">{video.product_sku || '-'}</div>
                        {video.product_link && (
                          <a
                            href={video.product_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline truncate block max-w-[150px]"
                          >
                            {video.product_link}
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="text-xs text-slate-600 truncate" title={video.caption || ''}>
                          {video.caption?.slice(0, 50) || '-'}
                          {(video.caption?.length || 0) > 50 && '...'}
                        </div>
                        {video.hashtags && video.hashtags.length > 0 && (
                          <div className="text-xs text-slate-400 truncate">
                            {video.hashtags.slice(0, 3).join(' ')}
                            {video.hashtags.length > 3 && ` +${video.hashtags.length - 3}`}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {video.has_locked_script ? (
                          <span className="text-green-600">Y</span>
                        ) : (
                          <span className="text-red-600">X</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {video.has_final_mp4 ? (
                          <span className="text-green-600">Y</span>
                        ) : (
                          <span className="text-amber-600">X</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {video.posting_meta_complete && video.has_locked_script ? (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                            Ready
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                            Incomplete
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {video.missing_fields.length > 0 ? (
                          <div className="text-xs text-red-600">
                            {video.missing_fields.join(', ')}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!video.uploader_checklist_completed_at && (
                            <button
                              onClick={() => handleMarkChecklistComplete(video.video_id)}
                              disabled={actionLoading === video.video_id}
                              className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 disabled:opacity-50"
                            >
                              {actionLoading === video.video_id ? '...' : 'Done'}
                            </button>
                          )}
                          {video.uploader_checklist_completed_at && (
                            <span className="text-xs text-green-600">Checked</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
