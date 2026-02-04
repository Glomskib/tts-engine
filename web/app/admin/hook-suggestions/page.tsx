'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import AdminPageLayout, { AdminCard, AdminButton, EmptyState } from '../components/AdminPageLayout';
import { postJson, isApiError, type ApiClientError } from '@/lib/http/fetchJson';
import ApiErrorPanel from '../components/ApiErrorPanel';

interface AuthUser {
  id: string;
  email: string | null;
  role: string | null;
}

interface HookSuggestion {
  id: string;
  created_at: string;
  source_video_id: string;
  product_id: string | null;
  brand_name: string | null;
  hook_type: string;
  hook_text: string;
  hook_hash: string;
  status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
}

interface OpsWarning {
  code: string;
  severity: 'info' | 'warn';
  title: string;
  message: string;
  cta?: { label: string; href?: string };
}

type StatusFilter = 'pending' | 'approved' | 'rejected';

const HOOK_TYPE_LABELS: Record<string, string> = {
  spoken: 'Spoken',
  visual: 'Visual',
  text: 'On-Screen',
};

export default function HookSuggestionsPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Data state
  const [suggestions, setSuggestions] = useState<HookSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<HookSuggestion | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<ApiClientError | null>(null);

  // Ops warnings state
  const [opsWarnings, setOpsWarnings] = useState<OpsWarning[]>([]);
  const [, setWarningsLoading] = useState(false);

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/hook-suggestions');
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
        router.push('/login?redirect=/admin/hook-suggestions');
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // Fetch suggestions
  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('status', statusFilter);
      params.set('limit', '100');

      const res = await fetch(`/api/admin/hook-suggestions?${params.toString()}`);
      const data = await res.json();

      if (data.ok) {
        setSuggestions(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch suggestions:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (authUser) {
      fetchSuggestions();
    }
  }, [authUser, fetchSuggestions]);

  // Approve suggestion
  const handleApprove = async () => {
    if (!selectedSuggestion) return;

    setActionLoading(true);
    setActionError(null);

    const result = await postJson<{ approved: boolean }>(
      `/api/admin/hook-suggestions/${selectedSuggestion.id}/approve`,
      {}
    );

    setActionLoading(false);

    if (isApiError(result)) {
      setActionError(result);
      return;
    }

    // Remove from list
    setSuggestions(prev => prev.filter(s => s.id !== selectedSuggestion.id));
    setDrawerOpen(false);
    setSelectedSuggestion(null);
  };

  // Reject suggestion
  const handleReject = async () => {
    if (!selectedSuggestion) return;

    setActionLoading(true);
    setActionError(null);

    const result = await postJson<{ rejected: boolean }>(
      `/api/admin/hook-suggestions/${selectedSuggestion.id}/reject`,
      {}
    );

    setActionLoading(false);

    if (isApiError(result)) {
      setActionError(result);
      return;
    }

    // Remove from list
    setSuggestions(prev => prev.filter(s => s.id !== selectedSuggestion.id));
    setDrawerOpen(false);
    setSelectedSuggestion(null);
  };

  const openDrawer = async (suggestion: HookSuggestion) => {
    setSelectedSuggestion(suggestion);
    setActionError(null);
    setOpsWarnings([]);
    setDrawerOpen(true);

    // Fetch ops warnings
    setWarningsLoading(true);
    try {
      const res = await fetch(`/api/admin/ops-warnings?type=hook_suggestion&id=${suggestion.id}`);
      const data = await res.json();
      if (data.ok && data.data?.warnings) {
        setOpsWarnings(data.data.warnings);
      }
    } catch (err) {
      console.error('Failed to fetch ops warnings:', err);
    } finally {
      setWarningsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const truncateText = (text: string, maxLen: number = 60) => {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
  };

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
          <p className="text-zinc-400 mb-4">Admin access required.</p>
          <Link href="/admin/pipeline" className="text-violet-400 hover:underline">
            Go to Work Queue
          </Link>
        </div>
      </div>
    );
  }

  return (
    <AdminPageLayout
      title="Hook Suggestions"
      subtitle="Review hooks from posted videos for the proven hooks library"
      showNav={false}
    >
      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap">
        {(['pending', 'approved', 'rejected'] as StatusFilter[]).map((status) => (
          <button type="button"
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              statusFilter === status
                ? 'bg-violet-600 text-white'
                : 'bg-zinc-800 text-zinc-300 border border-white/10 hover:bg-zinc-700'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Suggestions List */}
      <AdminCard noPadding>
        {loading ? (
          <div className="p-8 text-center text-zinc-400">Loading...</div>
        ) : suggestions.length === 0 ? (
          <EmptyState
            title={statusFilter === 'pending' ? 'No pending suggestions' : `No ${statusFilter} suggestions`}
            description={
              statusFilter === 'pending'
                ? 'Hooks from posted videos will appear here for review.'
                : `No suggestions have been ${statusFilter} yet.`
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-800/50 border-b border-white/10">
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">Hook Text</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">Brand</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">Created</th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((suggestion) => (
                  <tr
                    key={suggestion.id}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                    onClick={() => openDrawer(suggestion)}
                  >
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-zinc-700/50 text-zinc-300">
                        {HOOK_TYPE_LABELS[suggestion.hook_type] || suggestion.hook_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-300 max-w-[400px]" title={suggestion.hook_text}>
                      {truncateText(suggestion.hook_text)}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {suggestion.brand_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                      {formatDate(suggestion.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {statusFilter === 'pending' && (
                        <div className="flex gap-2 justify-end" onClick={e => e.stopPropagation()}>
                          <button type="button"
                            onClick={() => {
                              setSelectedSuggestion(suggestion);
                              handleApprove();
                            }}
                            className="text-xs text-green-400 hover:underline"
                          >
                            Approve
                          </button>
                          <button type="button"
                            onClick={() => {
                              setSelectedSuggestion(suggestion);
                              handleReject();
                            }}
                            className="text-xs text-red-400 hover:underline"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {statusFilter !== 'pending' && (
                        <span className="text-xs text-zinc-500">
                          {suggestion.reviewed_at ? formatDate(suggestion.reviewed_at) : '-'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {/* Drawer */}
      {drawerOpen && selectedSuggestion && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="relative w-full max-w-md bg-zinc-900 shadow-xl flex flex-col border-l border-white/10">
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-100">
                Review Hook Suggestion
              </h2>
              <button type="button"
                onClick={() => setDrawerOpen(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Hook Type */}
              <div>
                <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
                  Hook Type
                </div>
                <span className="px-2 py-1 rounded text-sm font-medium bg-zinc-700/50 text-zinc-300">
                  {HOOK_TYPE_LABELS[selectedSuggestion.hook_type] || selectedSuggestion.hook_type}
                </span>
              </div>

              {/* Hook Text */}
              <div>
                <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
                  Hook Text
                </div>
                <div className="text-sm text-zinc-200 bg-zinc-800 p-3 rounded-md border border-white/10">
                  {selectedSuggestion.hook_text}
                </div>
              </div>

              {/* Brand */}
              {selectedSuggestion.brand_name && (
                <div>
                  <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
                    Brand
                  </div>
                  <div className="text-sm text-zinc-300">
                    {selectedSuggestion.brand_name}
                  </div>
                </div>
              )}

              {/* Source Video */}
              <div>
                <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
                  Source Video
                </div>
                <Link
                  href={`/admin/pipeline/${selectedSuggestion.source_video_id}`}
                  className="text-sm text-violet-400 hover:underline font-mono"
                  target="_blank"
                >
                  {selectedSuggestion.source_video_id.slice(0, 8)}...
                </Link>
              </div>

              {/* Created At */}
              <div>
                <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
                  Created
                </div>
                <div className="text-sm text-zinc-400">
                  {formatDate(selectedSuggestion.created_at)}
                </div>
              </div>

              {/* Audit Trail Link */}
              <div className="pt-2 border-t border-white/10">
                <Link
                  href={`/admin/audit-log?entity_type=hook&entity_id=${selectedSuggestion.id}`}
                  className="text-xs text-zinc-500 hover:text-zinc-300 hover:underline"
                >
                  View audit trail
                </Link>
              </div>

              {/* Ops Warnings */}
              {opsWarnings.length > 0 && (
                <div className="space-y-2">
                  {opsWarnings.map((warning) => (
                    <div
                      key={warning.code}
                      className={`p-3 rounded-md text-sm ${
                        warning.severity === 'warn'
                          ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
                          : 'bg-zinc-800 border border-white/10 text-zinc-300'
                      }`}
                    >
                      <div className="font-medium text-xs uppercase tracking-wide mb-1">
                        {warning.title}
                      </div>
                      <div className="text-xs">{warning.message}</div>
                      {warning.cta && (
                        <Link
                          href={warning.cta.href || '#'}
                          className="text-xs text-zinc-400 hover:underline mt-1 inline-block"
                        >
                          {warning.cta.label}
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Error */}
              {actionError && (
                <ApiErrorPanel
                  error={actionError}
                  onDismiss={() => setActionError(null)}
                />
              )}
            </div>

            {/* Footer */}
            {selectedSuggestion.status === 'pending' && (
              <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
                <AdminButton
                  variant="danger"
                  onClick={handleReject}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Processing...' : 'Reject'}
                </AdminButton>
                <AdminButton
                  variant="primary"
                  onClick={handleApprove}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Processing...' : 'Approve'}
                </AdminButton>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminPageLayout>
  );
}
