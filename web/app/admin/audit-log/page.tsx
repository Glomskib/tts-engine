'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import AdminPageLayout, { AdminCard, AdminButton, EmptyState } from '../components/AdminPageLayout';

interface AuditRow {
  id: string;
  created_at: string;
  correlation_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  actor: string | null;
  summary: string;
  details: Record<string, unknown>;
}

interface AuditResponse {
  ok: boolean;
  correlation_id: string;
  data: {
    rows: AuditRow[];
    count: number;
  };
  error?: string;
  message?: string;
}

// Event type colors for badges
const EVENT_TYPE_COLORS: Record<string, string> = {
  'video.posted': 'bg-green-100 text-green-800',
  'video.claimed': 'bg-blue-100 text-blue-800',
  'video.released': 'bg-slate-100 text-slate-800',
  'hook.winner': 'bg-amber-100 text-amber-800',
  'hook.underperform': 'bg-red-100 text-red-800',
  'hook.approved': 'bg-emerald-100 text-emerald-800',
  'hook.rejected': 'bg-rose-100 text-rose-800',
  'product.updated': 'bg-purple-100 text-purple-800',
};

// Entity type colors
const ENTITY_TYPE_COLORS: Record<string, string> = {
  video: 'bg-blue-50 text-blue-700',
  hook: 'bg-amber-50 text-amber-700',
  product: 'bg-purple-50 text-purple-700',
};

export default function AdminAuditLogPage() {
  const router = useRouter();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Filters
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [entityIdFilter, setEntityIdFilter] = useState('');
  const [correlationIdFilter, setCorrelationIdFilter] = useState('');
  const [limit, setLimit] = useState(200);

  // Drawer state
  const [selectedRow, setSelectedRow] = useState<AuditRow | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Known event types for dropdown
  const eventTypes = [
    'video.posted',
    'video.claimed',
    'video.released',
    'hook.winner',
    'hook.underperform',
    'hook.approved',
    'hook.rejected',
    'product.updated',
  ];

  // Known entity types
  const entityTypes = ['video', 'hook', 'product'];

  // Check auth and admin status
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login');
        return;
      }

      // Check admin role
      supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .single()
        .then(({ data: profile }) => {
          const adminRole = profile?.role === 'admin';
          setIsAdmin(adminRole);
          setAuthChecked(true);
          if (!adminRole) {
            router.push('/admin/pipeline');
          }
        });
    });
  }, [router]);

  const fetchAuditLog = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', limit.toString());
      if (eventTypeFilter) params.set('event_type', eventTypeFilter);
      if (entityTypeFilter) params.set('entity_type', entityTypeFilter);
      if (entityIdFilter) params.set('entity_id', entityIdFilter);
      if (correlationIdFilter) params.set('correlation_id', correlationIdFilter);

      const res = await fetch(`/api/admin/audit-log?${params.toString()}`);
      const data: AuditResponse = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.message || data.error || 'Failed to fetch audit log');
      }

      setRows(data.data.rows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch audit log');
    } finally {
      setLoading(false);
    }
  }, [eventTypeFilter, entityTypeFilter, entityIdFilter, correlationIdFilter, limit]);

  useEffect(() => {
    if (isAdmin) {
      fetchAuditLog();
    }
  }, [isAdmin, fetchAuditLog]);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  const getEventTypeColor = (eventType: string) => {
    return EVENT_TYPE_COLORS[eventType] || 'bg-slate-100 text-slate-700';
  };

  const getEntityTypeColor = (entityType: string) => {
    return ENTITY_TYPE_COLORS[entityType] || 'bg-slate-50 text-slate-600';
  };

  const handleCopyCorrelationId = async () => {
    if (selectedRow) {
      try {
        await navigator.clipboard.writeText(selectedRow.correlation_id);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = selectedRow.correlation_id;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      }
    }
  };

  const closeDrawer = () => {
    setSelectedRow(null);
    setCopySuccess(false);
  };

  if (!authChecked) {
    return (
      <AdminPageLayout title="Audit Log">
        <div className="text-slate-500">Checking permissions...</div>
      </AdminPageLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AdminPageLayout title="Audit Log">
        <div className="text-red-600">Access denied. Admin role required.</div>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="Audit Log"
      subtitle="Read-only view of system mutations with correlation IDs"
      maxWidth="2xl"
    >
      {/* Filters */}
      <AdminCard>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Event Type</label>
            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="">All Events</option>
              {eventTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Entity Type</label>
            <select
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="">All Entities</option>
              {entityTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Entity ID</label>
            <input
              type="text"
              value={entityIdFilter}
              onChange={(e) => setEntityIdFilter(e.target.value)}
              placeholder="UUID..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400 font-mono"
            />
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Correlation ID</label>
            <input
              type="text"
              value={correlationIdFilter}
              onChange={(e) => setCorrelationIdFilter(e.target.value)}
              placeholder="Correlation ID..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400 font-mono"
            />
          </div>

          <div className="w-24">
            <label className="block text-xs font-medium text-slate-500 mb-1">Limit</label>
            <select
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>

          <div className="flex gap-2">
            <AdminButton onClick={fetchAuditLog} disabled={loading}>
              {loading ? 'Loading...' : 'Apply'}
            </AdminButton>
            <AdminButton
              variant="secondary"
              onClick={() => {
                setEventTypeFilter('');
                setEntityTypeFilter('');
                setEntityIdFilter('');
                setCorrelationIdFilter('');
                setLimit(200);
              }}
            >
              Clear
            </AdminButton>
          </div>
        </div>
      </AdminCard>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-center justify-between">
          <span>Error: {error}</span>
          <AdminButton variant="secondary" size="sm" onClick={fetchAuditLog}>
            Retry
          </AdminButton>
        </div>
      )}

      {/* Results */}
      <AdminCard title={`Audit Entries (${rows.length})`} noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left font-medium text-slate-600">Time</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Event</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Entity</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Actor</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Summary</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      title="No audit entries found"
                      description={
                        eventTypeFilter || entityTypeFilter || entityIdFilter || correlationIdFilter
                          ? 'Try adjusting your filters to see more results.'
                          : 'Audit entries will appear here as mutations occur.'
                      }
                    />
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedRow(row)}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                    <span title={row.created_at}>{formatTime(row.created_at)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getEventTypeColor(row.event_type)}`}>
                      {row.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getEntityTypeColor(row.entity_type)}`}>
                        {row.entity_type}
                      </span>
                      {row.entity_id && (
                        <span className="font-mono text-xs text-slate-500" title={row.entity_id}>
                          {row.entity_id.slice(0, 8)}...
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {row.actor ? (
                      <span title={row.actor}>{row.actor.slice(0, 8)}...</span>
                    ) : (
                      <span className="text-slate-400">system</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={row.summary}>
                    {row.summary}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>

      {/* Drawer */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black bg-opacity-30"
            onClick={closeDrawer}
          />

          {/* Drawer Panel */}
          <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-xl flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Audit Entry Details</h2>
              <button
                onClick={closeDrawer}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Key Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Event Type</label>
                  <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${getEventTypeColor(selectedRow.event_type)}`}>
                    {selectedRow.event_type}
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Entity Type</label>
                  <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${getEntityTypeColor(selectedRow.entity_type)}`}>
                    {selectedRow.entity_type}
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Entity ID</label>
                  <span className="font-mono text-sm text-slate-700">{selectedRow.entity_id || '-'}</span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Actor</label>
                  <span className="font-mono text-sm text-slate-700">{selectedRow.actor || 'system'}</span>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Created At</label>
                  <span className="text-sm text-slate-700">{formatTime(selectedRow.created_at)}</span>
                </div>
              </div>

              {/* Correlation ID with Copy */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Correlation ID</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-slate-100 rounded text-sm font-mono text-slate-700 break-all">
                    {selectedRow.correlation_id}
                  </code>
                  <AdminButton
                    variant="secondary"
                    size="sm"
                    onClick={handleCopyCorrelationId}
                  >
                    {copySuccess ? 'Copied' : 'Copy'}
                  </AdminButton>
                </div>
              </div>

              {/* Summary */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Summary</label>
                <p className="text-sm text-slate-700 bg-slate-50 px-3 py-2 rounded">{selectedRow.summary}</p>
              </div>

              {/* Details JSON */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Details</label>
                <pre className="text-xs bg-slate-900 text-slate-100 p-4 rounded overflow-auto max-h-64 font-mono">
                  {JSON.stringify(selectedRow.details, null, 2)}
                </pre>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200">
              <AdminButton variant="secondary" onClick={closeDrawer}>
                Close
              </AdminButton>
            </div>
          </div>
        </div>
      )}
    </AdminPageLayout>
  );
}
