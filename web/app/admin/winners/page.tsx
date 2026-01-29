'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

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
  transcript_text?: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
}

type StatusFilter = 'all' | 'ready' | 'processing' | 'needs_data' | 'failed';
type SortOption = 'newest' | 'oldest' | 'quality';

const STATUS_CONFIG: Record<string, { label: string; bgColor: string; textColor: string; dotColor: string }> = {
  queued: { label: 'Queued', bgColor: 'bg-slate-100', textColor: 'text-slate-700', dotColor: 'bg-slate-400' },
  needs_file: { label: 'Needs Data', bgColor: 'bg-amber-50', textColor: 'text-amber-700', dotColor: 'bg-amber-400' },
  needs_transcription: { label: 'Needs Data', bgColor: 'bg-amber-50', textColor: 'text-amber-700', dotColor: 'bg-amber-400' },
  processing: { label: 'Processing', bgColor: 'bg-blue-50', textColor: 'text-blue-700', dotColor: 'bg-blue-400' },
  ready: { label: 'Ready', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700', dotColor: 'bg-emerald-400' },
  failed: { label: 'Failed', bgColor: 'bg-red-50', textColor: 'text-red-700', dotColor: 'bg-red-400' },
};

const CATEGORY_OPTIONS = [
  'fitness', 'wellness', 'beauty', 'lifestyle', 'food', 'tech', 'fashion', 'comedy', 'education', 'other',
];

export default function WinnersPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Data state
  const [winners, setWinners] = useState<ReferenceVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Expanded view
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Submit form state
  const [submitUrl, setSubmitUrl] = useState('');
  const [submitCategory, setSubmitCategory] = useState('');
  const [submitNotes, setSubmitNotes] = useState('');
  const [submitTranscript, setSubmitTranscript] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Edit modal state
  const [editingWinner, setEditingWinner] = useState<ReferenceVideo | null>(null);
  const [editTranscript, setEditTranscript] = useState('');
  const [editSaving, setEditSaving] = useState(false);

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
      params.set('limit', '200');

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
  }, []);

  useEffect(() => {
    if (authUser) {
      fetchWinners();
    }
  }, [authUser, fetchWinners]);

  // Computed stats
  const stats = useMemo(() => {
    const total = winners.length;
    const ready = winners.filter(w => w.status === 'ready').length;
    const avgQuality = winners.reduce((sum, w) => {
      const score = w.reference_extracts?.[0]?.quality_score;
      return score ? sum + score : sum;
    }, 0) / (winners.filter(w => w.reference_extracts?.[0]?.quality_score).length || 1);

    // Count hook families
    const hookFamilies: Record<string, number> = {};
    winners.forEach(w => {
      const family = w.reference_extracts?.[0]?.hook_family;
      if (family) {
        hookFamilies[family] = (hookFamilies[family] || 0) + 1;
      }
    });
    const topHookStyle = Object.entries(hookFamilies).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    return { total, ready, avgQuality: Math.round(avgQuality), topHookStyle };
  }, [winners]);

  // Filtered and sorted winners
  const filteredWinners = useMemo(() => {
    let result = [...winners];

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'needs_data') {
        result = result.filter(w => w.status === 'needs_file' || w.status === 'needs_transcription');
      } else {
        result = result.filter(w => w.status === statusFilter);
      }
    }

    // Category filter
    if (categoryFilter) {
      result = result.filter(w => w.category === categoryFilter);
    }

    // Sort
    if (sortBy === 'newest') {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === 'oldest') {
      result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sortBy === 'quality') {
      result.sort((a, b) => {
        const scoreA = a.reference_extracts?.[0]?.quality_score || 0;
        const scoreB = b.reference_extracts?.[0]?.quality_score || 0;
        return scoreB - scoreA;
      });
    }

    return result;
  }, [winners, statusFilter, categoryFilter, sortBy]);

  // Submit new winner
  const handleSubmit = async () => {
    if (!submitUrl.trim()) {
      setSubmitError('Please enter a TikTok URL');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

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

      // Success
      setSubmitUrl('');
      setSubmitCategory('');
      setSubmitNotes('');
      setSubmitTranscript('');
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);
      fetchWinners();
    } catch (err) {
      setSubmitError('Network error');
      console.error('Submit error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Edit transcript
  const openEditModal = (winner: ReferenceVideo) => {
    setEditingWinner(winner);
    setEditTranscript(winner.transcript_text || '');
  };

  const handleSaveTranscript = async () => {
    if (!editingWinner || !editTranscript.trim()) return;

    setEditSaving(true);
    try {
      const res = await fetch(`/api/winners/${editingWinner.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript_text: editTranscript.trim() }),
      });

      if (res.ok) {
        setEditingWinner(null);
        fetchWinners();
      }
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setEditSaving(false);
    }
  };

  // Delete winner
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this winner? This cannot be undone.')) return;

    try {
      const res = await fetch(`/api/winners/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (expandedId === id) setExpandedId(null);
        fetchWinners();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const truncateUrl = (url: string, maxLen = 35) => {
    if (url.length <= maxLen) return url;
    return url.slice(0, maxLen) + '...';
  };

  const getStatusConfig = (status: string) => {
    return STATUS_CONFIG[status] || STATUS_CONFIG.queued;
  };

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  // Forbidden state
  if (!authUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h1>
          <p className="text-slate-600 mb-4">Admin access required.</p>
          <Link href="/login" className="text-blue-600 hover:underline">Sign In</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">🏆</span>
              <h1 className="text-2xl font-bold text-slate-900">Winners Bank</h1>
            </div>
            <p className="text-slate-600">Import winning TikToks to train AI on what works</p>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-6">
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
              <div className="text-sm text-slate-500">Total Winners</div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-emerald-600">{stats.ready}</div>
              <div className="text-sm text-slate-500">Ready to Use</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">{stats.avgQuality}</div>
              <div className="text-sm text-slate-500">Avg Quality</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-purple-600 truncate">{stats.topHookStyle}</div>
              <div className="text-sm text-slate-500">Top Hook Style</div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Submit Form Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Add a Winner</h2>

          <div className="space-y-4">
            {/* URL Input */}
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  type="url"
                  value={submitUrl}
                  onChange={(e) => setSubmitUrl(e.target.value)}
                  placeholder="Paste TikTok URL..."
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting || !submitUrl.trim()}
                className="px-6 py-3 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Adding...' : 'Add Winner'}
              </button>
            </div>

            {/* Optional Fields Toggle */}
            <details className="group">
              <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-700">
                + Add category, notes, or transcript
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={submitCategory}
                    onChange={(e) => setSubmitCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select...</option>
                    {CATEGORY_OPTIONS.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                  <input
                    type="text"
                    value={submitNotes}
                    onChange={(e) => setSubmitNotes(e.target.value)}
                    placeholder="Why is this a winner?"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Transcript <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={submitTranscript}
                    onChange={(e) => setSubmitTranscript(e.target.value)}
                    placeholder="Paste the video transcript for instant AI analysis..."
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </details>

            {/* Feedback */}
            {submitError && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <span>⚠️</span> {submitError}
              </div>
            )}
            {submitSuccess && (
              <div className="flex items-center gap-2 text-emerald-600 text-sm">
                <span>✓</span> Winner added successfully!
              </div>
            )}

            <p className="text-xs text-slate-400">
              We'll extract the transcript and analyze what makes it work. You can also paste the transcript directly for faster processing.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Status Pills */}
          <div className="flex gap-1 bg-white rounded-lg p-1 shadow-sm border border-slate-200">
            {(['all', 'ready', 'processing', 'needs_data', 'failed'] as StatusFilter[]).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  statusFilter === status
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {status === 'all' ? 'All' :
                 status === 'ready' ? 'Ready' :
                 status === 'processing' ? 'Processing' :
                 status === 'needs_data' ? 'Needs Data' : 'Failed'}
              </button>
            ))}
          </div>

          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Categories</option>
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>

          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="quality">Highest Quality</option>
          </select>

          {/* Count */}
          <span className="text-sm text-slate-500 ml-auto">
            {filteredWinners.length} winner{filteredWinners.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Winners List */}
        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading winners...</div>
        ) : filteredWinners.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <div className="text-6xl mb-4">🏆</div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              {winners.length === 0 ? 'No winners yet' : 'No matches found'}
            </h3>
            <p className="text-slate-600 mb-6 max-w-md mx-auto">
              {winners.length === 0
                ? 'Import your first winning TikTok to start training the AI on what works.'
                : 'Try adjusting your filters to see more results.'}
            </p>
            {winners.length === 0 && (
              <button
                onClick={() => (document.querySelector('input[type="url"]') as HTMLInputElement)?.focus()}
                className="px-6 py-3 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
              >
                Add Your First Winner
              </button>
            )}
          </div>
        ) : (
          /* Winner Cards */
          <div className="space-y-3">
            {filteredWinners.map((winner) => {
              const statusConfig = getStatusConfig(winner.status);
              const extract = winner.reference_extracts?.[0];
              const isExpanded = expandedId === winner.id;

              return (
                <div
                  key={winner.id}
                  className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-shadow hover:shadow-md"
                >
                  {/* Card Header */}
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : winner.id)}
                  >
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-pink-500 to-red-500 rounded-lg flex items-center justify-center text-white text-xl">
                        ▶
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <a
                            href={winner.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-600 hover:underline font-medium text-sm truncate"
                          >
                            {truncateUrl(winner.url)}
                          </a>
                          {winner.category && (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">
                              {winner.category}
                            </span>
                          )}
                        </div>

                        {extract?.spoken_hook ? (
                          <p className="text-slate-700 text-sm line-clamp-2">
                            "{extract.spoken_hook}"
                          </p>
                        ) : (
                          <p className="text-slate-400 text-sm italic">
                            Hook not extracted yet
                          </p>
                        )}
                      </div>

                      {/* Right Side */}
                      <div className="flex-shrink-0 text-right">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotColor}`}></span>
                          {statusConfig.label}
                        </div>
                        {extract?.quality_score != null && (
                          <div className={`mt-1 text-lg font-bold ${
                            extract.quality_score >= 80 ? 'text-emerald-600' :
                            extract.quality_score >= 60 ? 'text-amber-500' : 'text-slate-400'
                          }`}>
                            {extract.quality_score}
                          </div>
                        )}
                        <div className="text-xs text-slate-400 mt-1">
                          {formatDate(winner.created_at)}
                        </div>
                      </div>

                      {/* Expand Icon */}
                      <div className="flex-shrink-0 text-slate-400">
                        <svg
                          className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 p-4 bg-slate-50">
                      <div className="grid gap-4 sm:grid-cols-2">
                        {/* Left Column */}
                        <div className="space-y-4">
                          {extract && (
                            <>
                              <div>
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Hook Family</div>
                                <div className="text-sm text-slate-800 font-medium">{extract.hook_family}</div>
                              </div>
                              <div>
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Full Hook</div>
                                <div className="text-sm text-slate-700 bg-white p-3 rounded-lg border border-slate-200">
                                  "{extract.spoken_hook}"
                                </div>
                              </div>
                            </>
                          )}
                          {winner.notes && (
                            <div>
                              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Notes</div>
                              <div className="text-sm text-slate-600">{winner.notes}</div>
                            </div>
                          )}
                        </div>

                        {/* Right Column */}
                        <div className="space-y-4">
                          {winner.error_message && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                              <div className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1">Error</div>
                              <div className="text-sm text-red-700">{winner.error_message}</div>
                            </div>
                          )}

                          <div>
                            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Video URL</div>
                            <a
                              href={winner.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline break-all"
                            >
                              {winner.url} ↗
                            </a>
                          </div>

                          <div>
                            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Submitted By</div>
                            <div className="text-sm text-slate-600">{winner.submitted_by}</div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-200">
                        {(winner.status === 'needs_file' || winner.status === 'needs_transcription' || winner.status === 'failed') && (
                          <button
                            onClick={() => openEditModal(winner)}
                            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            Add Transcript
                          </button>
                        )}
                        <a
                          href={winner.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-slate-100 text-slate-700 text-sm rounded-lg hover:bg-slate-200 transition-colors"
                        >
                          Open Video
                        </a>
                        <button
                          onClick={() => handleDelete(winner.id)}
                          className="px-4 py-2 text-red-600 text-sm hover:bg-red-50 rounded-lg transition-colors ml-auto"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Edit Modal */}
      {editingWinner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div
            className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Add Transcript</h3>
                <button
                  onClick={() => setEditingWinner(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <a
                href={editingWinner.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline mt-1 block truncate"
              >
                {editingWinner.url}
              </a>
            </div>

            <div className="p-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Video Transcript
              </label>
              <textarea
                value={editTranscript}
                onChange={(e) => setEditTranscript(e.target.value)}
                placeholder="Paste the video transcript here..."
                rows={8}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500 mt-2">
                AI will automatically extract hooks and analyze what makes this video work.
              </p>
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setEditingWinner(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTranscript}
                disabled={editSaving || !editTranscript.trim()}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {editSaving ? 'Saving...' : 'Save & Analyze'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back to Admin Link */}
      <div className="fixed bottom-4 left-4">
        <Link
          href="/admin/pipeline"
          className="flex items-center gap-2 px-4 py-2 bg-white shadow-lg rounded-lg text-sm text-slate-600 hover:text-slate-900 border border-slate-200"
        >
          ← Back to Admin
        </Link>
      </div>
    </div>
  );
}
