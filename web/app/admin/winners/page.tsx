'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import AdminPageLayout, { AdminCard, AdminButton, EmptyState } from '../components/AdminPageLayout';

interface AuthUser {
  id: string;
  email: string | null;
  role: string | null;
}

interface ReferenceExtract {
  spoken_hook: string;
  hook_family: string;
  quality_score: number;
}

interface ReferenceVideo {
  id: string;
  url: string;
  submitted_by: string;
  notes: string | null;
  category: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  reference_extracts: ReferenceExtract[];
}

type StatusFilter = 'all' | 'needs_file' | 'needs_transcription' | 'processing' | 'ready' | 'failed';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  queued: { label: 'Queued', color: 'bg-slate-100 text-slate-700' },
  needs_file: { label: 'Needs File', color: 'bg-amber-100 text-amber-700' },
  needs_transcription: { label: 'Needs Transcript', color: 'bg-amber-100 text-amber-700' },
  processing: { label: 'Processing', color: 'bg-blue-100 text-blue-700' },
  ready: { label: 'Ready', color: 'bg-green-100 text-green-700' },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700' },
};

const CATEGORY_OPTIONS = [
  'fitness',
  'wellness',
  'beauty',
  'lifestyle',
  'food',
  'tech',
  'fashion',
  'other',
];

export default function WinnersPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Data state
  const [winners, setWinners] = useState<ReferenceVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'submit' | 'transcript' | 'view'>('submit');
  const [selectedWinner, setSelectedWinner] = useState<ReferenceVideo | null>(null);

  // Form state
  const [submitUrl, setSubmitUrl] = useState('');
  const [submitCategory, setSubmitCategory] = useState('');
  const [submitNotes, setSubmitNotes] = useState('');
  const [submitTranscript, setSubmitTranscript] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/winners');
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
        router.push('/login?redirect=/admin/winners');
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // Fetch winners
  const fetchWinners = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      params.set('limit', '100');

      const res = await fetch(`/api/winners?${params.toString()}`);
      const data = await res.json();

      if (data.ok) {
        setWinners(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch winners:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (authUser) {
      fetchWinners();
    }
  }, [authUser, fetchWinners]);

  // Submit new winner
  const handleSubmit = async () => {
    if (!submitUrl.trim()) {
      setSubmitError('URL is required');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/winners/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: submitUrl.trim(),
          category: submitCategory || undefined,
          notes: submitNotes.trim() || undefined,
          transcript_text: submitTranscript.trim() || undefined,
          submitted_by: authUser?.email || 'admin',
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        setSubmitError(data.error || 'Failed to submit');
        return;
      }

      // Success - close drawer and refresh
      setDrawerOpen(false);
      resetForm();
      fetchWinners();
    } catch (err) {
      setSubmitError('Network error');
      console.error('Submit error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Add transcript to existing winner
  const handleAddTranscript = async () => {
    if (!selectedWinner || !submitTranscript.trim()) {
      setSubmitError('Transcript is required');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/winners/${selectedWinner.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript_text: submitTranscript.trim(),
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        setSubmitError(data.error || 'Failed to add transcript');
        return;
      }

      // Success - close drawer and refresh
      setDrawerOpen(false);
      resetForm();
      fetchWinners();
    } catch (err) {
      setSubmitError('Network error');
      console.error('Add transcript error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Delete winner
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this winner? This cannot be undone.')) return;

    try {
      const res = await fetch(`/api/winners/${id}`, { method: 'DELETE' });
      const data = await res.json();

      if (data.ok) {
        fetchWinners();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const resetForm = () => {
    setSubmitUrl('');
    setSubmitCategory('');
    setSubmitNotes('');
    setSubmitTranscript('');
    setSubmitError(null);
    setSelectedWinner(null);
  };

  const openSubmitDrawer = () => {
    resetForm();
    setDrawerMode('submit');
    setDrawerOpen(true);
  };

  const openTranscriptDrawer = (winner: ReferenceVideo) => {
    resetForm();
    setSelectedWinner(winner);
    setDrawerMode('transcript');
    setDrawerOpen(true);
  };

  const openViewDrawer = (winner: ReferenceVideo) => {
    setSelectedWinner(winner);
    setDrawerMode('view');
    setDrawerOpen(true);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
    });
  };

  const truncateUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname;
      if (path.length > 30) {
        return parsed.hostname + path.slice(0, 27) + '...';
      }
      return parsed.hostname + path;
    } catch {
      return url.slice(0, 40) + '...';
    }
  };

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
            Go to Work Queue
          </Link>
        </div>
      </div>
    );
  }

  return (
    <AdminPageLayout
      title="Winners Bank"
      subtitle="Reference videos for AI context and hook extraction"
      showNav={false}
      headerActions={
        <AdminButton onClick={openSubmitDrawer}>
          Submit TikTok
        </AdminButton>
      }
    >
      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'ready', 'processing', 'needs_file', 'needs_transcription', 'failed'] as StatusFilter[]).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              statusFilter === status
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
            }`}
          >
            {status === 'all' ? 'All' : STATUS_LABELS[status]?.label || status}
          </button>
        ))}
      </div>

      {/* Winners List */}
      <AdminCard noPadding>
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : winners.length === 0 ? (
          <EmptyState
            title="No winners yet"
            description="Submit TikTok links to build your reference library."
            action={
              <AdminButton onClick={openSubmitDrawer}>
                Submit First Winner
              </AdminButton>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">URL</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Category</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Hook</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Quality</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Submitted</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {winners.map((winner) => {
                  const extract = winner.reference_extracts?.[0];
                  return (
                    <tr key={winner.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <a
                          href={winner.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline font-mono text-xs"
                          title={winner.url}
                        >
                          {truncateUrl(winner.url)}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {winner.category || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_LABELS[winner.status]?.color || 'bg-slate-100 text-slate-600'}`}>
                          {STATUS_LABELS[winner.status]?.label || winner.status}
                        </span>
                        {winner.error_message && (
                          <span className="block text-xs text-red-500 mt-1" title={winner.error_message}>
                            {winner.error_message.slice(0, 30)}...
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate" title={extract?.spoken_hook}>
                        {extract?.spoken_hook || '-'}
                      </td>
                      <td className="px-4 py-3">
                        {extract?.quality_score != null ? (
                          <span className={`font-medium ${
                            extract.quality_score >= 80 ? 'text-green-600' :
                            extract.quality_score >= 60 ? 'text-amber-600' :
                            'text-slate-500'
                          }`}>
                            {extract.quality_score}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {formatDate(winner.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          {/* Status-based actions */}
                          {(winner.status === 'needs_file' || winner.status === 'needs_transcription') && (
                            <button
                              onClick={() => openTranscriptDrawer(winner)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Add Transcript
                            </button>
                          )}
                          {winner.status === 'ready' && (
                            <button
                              onClick={() => openViewDrawer(winner)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              View Extract
                            </button>
                          )}
                          {winner.status === 'failed' && (
                            <button
                              onClick={() => openTranscriptDrawer(winner)}
                              className="text-xs text-amber-600 hover:underline"
                            >
                              Retry
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(winner.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">
                {drawerMode === 'submit' && 'Submit TikTok Winner'}
                {drawerMode === 'transcript' && 'Add Transcript'}
                {drawerMode === 'view' && 'View Extract'}
              </h2>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {drawerMode === 'submit' && (
                <>
                  {/* URL */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      TikTok URL <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="url"
                      value={submitUrl}
                      onChange={(e) => setSubmitUrl(e.target.value)}
                      placeholder="https://www.tiktok.com/@user/video/123..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Category
                    </label>
                    <select
                      value={submitCategory}
                      onChange={(e) => setSubmitCategory(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                    >
                      <option value="">Select category...</option>
                      {CATEGORY_OPTIONS.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={submitNotes}
                      onChange={(e) => setSubmitNotes(e.target.value)}
                      placeholder="Why is this a winner? What makes it effective?"
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>

                  {/* Transcript */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Transcript
                      <span className="text-slate-400 font-normal ml-1">(optional - paste to auto-extract)</span>
                    </label>
                    <textarea
                      value={submitTranscript}
                      onChange={(e) => setSubmitTranscript(e.target.value)}
                      placeholder="Paste the video transcript here..."
                      rows={6}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      If provided, AI will extract hooks, CTA, and structure automatically.
                    </p>
                  </div>
                </>
              )}

              {drawerMode === 'transcript' && selectedWinner && (
                <>
                  <div className="bg-slate-50 rounded-md p-3 text-sm">
                    <div className="font-medium text-slate-700 mb-1">Video URL:</div>
                    <a
                      href={selectedWinner.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline break-all text-xs"
                    >
                      {selectedWinner.url}
                    </a>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Transcript <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={submitTranscript}
                      onChange={(e) => setSubmitTranscript(e.target.value)}
                      placeholder="Paste the video transcript here..."
                      rows={10}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      AI will extract hooks, CTA, and structure from this transcript.
                    </p>
                  </div>
                </>
              )}

              {drawerMode === 'view' && selectedWinner && (
                <>
                  <div className="bg-slate-50 rounded-md p-3 text-sm">
                    <div className="font-medium text-slate-700 mb-1">Video URL:</div>
                    <a
                      href={selectedWinner.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline break-all text-xs"
                    >
                      {selectedWinner.url}
                    </a>
                  </div>

                  {selectedWinner.reference_extracts?.[0] ? (
                    <div className="space-y-4">
                      <div>
                        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Spoken Hook</div>
                        <div className="text-sm text-slate-800 bg-green-50 p-3 rounded-md border border-green-200">
                          {selectedWinner.reference_extracts[0].spoken_hook}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Hook Family</div>
                          <div className="text-sm text-slate-700">
                            {selectedWinner.reference_extracts[0].hook_family}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Quality Score</div>
                          <div className={`text-lg font-semibold ${
                            selectedWinner.reference_extracts[0].quality_score >= 80 ? 'text-green-600' :
                            selectedWinner.reference_extracts[0].quality_score >= 60 ? 'text-amber-600' :
                            'text-slate-500'
                          }`}>
                            {selectedWinner.reference_extracts[0].quality_score}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-500 text-sm">No extract available yet.</div>
                  )}
                </>
              )}

              {/* Error */}
              {submitError && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
                  {submitError}
                </div>
              )}
            </div>

            {/* Footer */}
            {(drawerMode === 'submit' || drawerMode === 'transcript') && (
              <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
                <AdminButton
                  variant="secondary"
                  onClick={() => setDrawerOpen(false)}
                >
                  Cancel
                </AdminButton>
                <AdminButton
                  onClick={drawerMode === 'submit' ? handleSubmit : handleAddTranscript}
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : drawerMode === 'submit' ? 'Submit' : 'Extract Hooks'}
                </AdminButton>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminPageLayout>
  );
}
