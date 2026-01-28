'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useHydrated, getTimeAgo } from '@/lib/useHydrated';
import UploaderDrawer from './components/UploaderDrawer';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';

interface AuthUser {
  id: string;
  email: string | null;
  role: string | null;
  isAdmin: boolean;
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
      done: string;
    };
    available_target_accounts: string[];
  };
  error?: string;
}

const STATUS_OPTIONS = [
  { value: 'ready_to_post', label: 'Ready to Post' },
  { value: 'needs_edit', label: 'Needs Edit' },
];

const DONE_OPTIONS = [
  { value: '0', label: 'Not Done' },
  { value: '1', label: 'Done' },
  { value: 'all', label: 'All' },
];

const PLATFORM_OPTIONS = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'other', label: 'Other' },
];

export default function UploaderPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

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
  const [doneFilter, setDoneFilter] = useState<'0' | '1' | 'all'>('0');
  const [availableTargetAccounts, setAvailableTargetAccounts] = useState<string[]>([]);

  // Actions
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Mark Posted modal state
  const [markPostedVideo, setMarkPostedVideo] = useState<UploaderVideo | null>(null);
  const [postedUrl, setPostedUrl] = useState('');
  const [postedPlatform, setPostedPlatform] = useState<'tiktok' | 'instagram' | 'youtube' | 'other'>('tiktok');
  const [markPostedLoading, setMarkPostedLoading] = useState(false);
  const [markPostedError, setMarkPostedError] = useState('');

  // Admin dev tools state
  const [seedingVideo, setSeedingVideo] = useState(false);
  const [seedError, setSeedError] = useState('');

  // Drawer state
  const [drawerVideo, setDrawerVideo] = useState<UploaderVideo | null>(null);

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
          isAdmin: roleData.isAdmin === true,
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
    params.set('done', doneFilter);
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
  }, [authUser, statusFilter, targetAccountFilter, missingOnly, doneFilter]);

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

  // Open mark posted modal
  const openMarkPostedModal = useCallback((video: UploaderVideo) => {
    setMarkPostedVideo(video);
    setPostedUrl('');
    setPostedPlatform('tiktok');
    setMarkPostedError('');
  }, []);

  // Close mark posted modal
  const closeMarkPostedModal = useCallback(() => {
    setMarkPostedVideo(null);
    setPostedUrl('');
    setPostedPlatform('tiktok');
    setMarkPostedError('');
  }, []);

  // Mark video as posted
  const handleMarkPosted = useCallback(async () => {
    if (!markPostedVideo || !postedUrl.trim()) {
      setMarkPostedError('Posted URL is required');
      return;
    }

    // Basic URL validation
    try {
      const url = new URL(postedUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        setMarkPostedError('URL must be HTTP or HTTPS');
        return;
      }
    } catch {
      setMarkPostedError('Invalid URL format');
      return;
    }

    setMarkPostedLoading(true);
    setMarkPostedError('');

    try {
      const res = await fetch(`/api/videos/${markPostedVideo.video_id}/mark-posted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          posted_url: postedUrl.trim(),
          platform: postedPlatform,
        }),
      });
      const data = await res.json();

      if (data.ok) {
        // Remove video from list (it's now posted, no longer ready_to_post)
        setVideos((prev) => prev.filter((v) => v.video_id !== markPostedVideo.video_id));
        setTotal((prev) => Math.max(0, prev - 1));
        closeMarkPostedModal();
        // Re-fetch to ensure consistency
        fetchQueue();
      } else {
        // Show error code and message for debugging
        const errorMsg = data.code
          ? `[${data.code}] ${data.error || 'Failed to mark as posted'}`
          : (data.error || 'Failed to mark as posted');
        setMarkPostedError(errorMsg);
      }
    } catch (err) {
      console.error(err);
      setMarkPostedError('Failed to mark as posted');
    } finally {
      setMarkPostedLoading(false);
    }
  }, [markPostedVideo, postedUrl, postedPlatform, closeMarkPostedModal, fetchQueue]);

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

  // Open/close drawer
  const openDrawer = (video: UploaderVideo) => {
    setDrawerVideo(video);
  };

  const closeDrawer = () => {
    setDrawerVideo(null);
  };

  // Handle row click to open drawer
  const handleRowClick = (e: React.MouseEvent, video: UploaderVideo) => {
    const target = e.target as HTMLElement;
    // Don't open drawer if clicking on buttons, links, or inputs
    if (
      target.closest('button') ||
      target.closest('a') ||
      target.closest('input') ||
      target.closest('select')
    ) {
      return;
    }
    openDrawer(video);
  };

  // Seed test video (admin only)
  const handleSeedTestVideo = useCallback(async () => {
    if (!authUser?.isAdmin) return;

    setSeedingVideo(true);
    setSeedError('');

    try {
      const res = await fetch('/api/admin/dev/seed-postable-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (data.ok) {
        // Re-fetch queue to show the new video
        await fetchQueue();
      } else {
        setSeedError(data.code ? `[${data.code}] ${data.error}` : data.error);
      }
    } catch (err) {
      console.error(err);
      setSeedError('Failed to seed test video');
    } finally {
      setSeedingVideo(false);
    }
  }, [authUser?.isAdmin, fetchQueue]);

  // Loading state
  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: colors.textMuted }}>Checking access...</div>
      </div>
    );
  }

  // Access denied
  if (accessDenied) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: colors.danger, marginBottom: '8px' }}>Access Denied</h1>
          <p style={{ color: colors.textMuted, marginBottom: '16px' }}>Uploader or admin access required.</p>
          <Link href="/" style={{ color: colors.accent }}>
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
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg }}>
      {/* Header */}
      <header style={{ backgroundColor: colors.surface, borderBottom: `1px solid ${colors.border}`, padding: '16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: colors.text, margin: 0 }}>Uploader Console</h1>
            <p style={{ fontSize: '13px', color: colors.textMuted, margin: '4px 0 0' }}>Daily posting queue</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: colors.textMuted }}>{authUser?.email}</span>
            <Link href="/admin/pipeline" style={{ fontSize: '13px', color: colors.accent }}>
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

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Checklist</label>
              <select
                value={doneFilter}
                onChange={(e) => setDoneFilter(e.target.value as '0' | '1' | 'all')}
                className="p-2 border border-slate-300 rounded-md text-sm min-w-[120px]"
              >
                {DONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
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
              {/* Admin-only: Seed Test Video */}
              {authUser?.isAdmin && (
                <button
                  onClick={handleSeedTestVideo}
                  disabled={seedingVideo}
                  className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-100 rounded-md hover:bg-amber-200 disabled:opacity-50"
                  title="Create a test video with all requirements met"
                >
                  {seedingVideo ? 'Seeding...' : 'Seed Test Video'}
                </button>
              )}
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
          {/* Seed error */}
          {seedError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {seedError}
            </div>
          )}
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
                    <th className="px-4 py-3 text-center font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {videos.map((video) => (
                    <tr
                      key={video.video_id}
                      onClick={(e) => handleRowClick(e, video)}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openDrawer(video)}
                          className="font-mono text-xs text-blue-600 hover:underline bg-transparent border-none cursor-pointer p-0"
                        >
                          {video.video_id.slice(0, 8)}...
                        </button>
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
                      </td>
                      <td className="px-4 py-3 text-center">
                        {video.posting_meta_complete && video.has_locked_script && video.has_final_mp4 ? (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                            Ready
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                            {video.missing_fields.length > 0 ? video.missing_fields[0] : 'Incomplete'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Mark Posted Modal */}
      {markPostedVideo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">Mark as Posted</h2>
              <p className="text-sm text-slate-500 mt-1">
                Video: {markPostedVideo.video_id.slice(0, 8)}...
                {markPostedVideo.target_account && (
                  <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                    {markPostedVideo.target_account}
                  </span>
                )}
              </p>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Posted URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={postedUrl}
                  onChange={(e) => setPostedUrl(e.target.value)}
                  placeholder="https://www.tiktok.com/@account/video/123..."
                  className="w-full p-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Platform
                </label>
                <select
                  value={postedPlatform}
                  onChange={(e) => setPostedPlatform(e.target.value as 'tiktok' | 'instagram' | 'youtube' | 'other')}
                  className="w-full p-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {PLATFORM_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {markPostedError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                  {markPostedError}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={closeMarkPostedModal}
                disabled={markPostedLoading}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkPosted}
                disabled={markPostedLoading || !postedUrl.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {markPostedLoading ? 'Marking...' : 'Mark Posted'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Details Drawer */}
      {drawerVideo && (
        <UploaderDrawer
          video={drawerVideo}
          onClose={closeDrawer}
          onOpenPostModal={(video) => {
            openMarkPostedModal(video);
          }}
          onMarkChecklistComplete={handleMarkChecklistComplete}
          onRefresh={() => {
            fetchQueue();
            // Update drawer video if still exists
            const updated = videos.find(v => v.video_id === drawerVideo.video_id);
            if (updated) {
              setDrawerVideo(updated);
            }
          }}
        />
      )}
    </div>
  );
}
