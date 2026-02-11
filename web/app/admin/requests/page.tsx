'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useHydrated, formatDateString } from '@/lib/useHydrated';
import { useToast } from '@/contexts/ToastContext';
import {
  getRequestSLAStatus,
  SLAStatus,
  RequestPriority as LibRequestPriority,
} from '@/lib/client-requests';

interface AuthUser {
  id: string;
  email: string | null;
  isAdmin: boolean;
}

type RequestPriority = 'LOW' | 'NORMAL' | 'HIGH';

interface ClientRequest {
  request_id: string;
  org_id: string;
  org_name: string;
  project_id?: string;
  request_type: 'AI_CONTENT' | 'UGC_EDIT';
  title: string;
  brief: string;
  product_url?: string;
  ugc_links?: string[];
  notes?: string;
  requested_by_user_id: string;
  requested_by_email?: string;
  status: string;
  status_reason?: string;
  video_id?: string;
  priority?: RequestPriority;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  SUBMITTED: { bg: '#e7f5ff', text: '#1971c2' },
  IN_REVIEW: { bg: '#fff3bf', text: '#e67700' },
  APPROVED: { bg: '#d3f9d8', text: '#2f9e44' },
  REJECTED: { bg: '#ffe3e3', text: '#e03131' },
  CONVERTED: { bg: '#f3d9fa', text: '#9c36b5' },
};

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Submitted',
  IN_REVIEW: 'In Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CONVERTED: 'Converted',
};

const TYPE_LABELS: Record<string, string> = {
  AI_CONTENT: 'AI Content',
  UGC_EDIT: 'UGC Edit',
};

const PRIORITY_COLORS: Record<RequestPriority, { bg: string; text: string; border: string }> = {
  LOW: { bg: '#f8f9fa', text: '#868e96', border: '#ced4da' },
  NORMAL: { bg: '#e7f5ff', text: '#1971c2', border: '#74c0fc' },
  HIGH: { bg: '#ffe3e3', text: '#c92a2a', border: '#ffa8a8' },
};

const PRIORITY_ORDER: Record<RequestPriority, number> = {
  HIGH: 0,
  NORMAL: 1,
  LOW: 2,
};

const SLA_STATUS_COLORS: Record<SLAStatus, { bg: string; text: string; border: string }> = {
  OK: { bg: '#d3f9d8', text: '#2f9e44', border: '#69db7c' },
  WARNING: { bg: '#fff3bf', text: '#e67700', border: '#ffc078' },
  BREACHED: { bg: '#ffe3e3', text: '#c92a2a', border: '#ff8787' },
};

type SortMode = 'newest' | 'oldest' | 'priority';

/**
 * Format duration in milliseconds to human-readable string.
 */
function formatAge(ms: number): string {
  if (ms < 0) return '0m';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

export default function AdminRequestsPage() {
  const hydrated = useHydrated();
  const { showError, showSuccess } = useToast();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [slaFilter, setSlaFilter] = useState<string>('');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [now, setNow] = useState(Date.now());

  // Update "now" every minute for SLA age display
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch auth
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();

        if (res.ok && data.ok && data.user) {
          setAuthUser({
            id: data.user.id,
            email: data.user.email,
            isAdmin: data.user.role === 'admin',
          });
        } else {
          window.location.href = '/login?redirect=/admin/requests';
        }
      } catch (err) {
        console.error('Auth error:', err);
        window.location.href = '/login?redirect=/admin/requests';
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Fetch requests
  useEffect(() => {
    if (!authUser?.isAdmin) return;

    const fetchRequests = async () => {
      try {
        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        if (typeFilter) params.set('request_type', typeFilter);

        const res = await fetch(`/api/admin/client-requests?${params.toString()}`);
        const data = await res.json();

        if (res.ok && data.ok) {
          // Set default priority to NORMAL for requests without priority
          const requestsWithPriority = (data.data || []).map((r: ClientRequest) => ({
            ...r,
            priority: r.priority || 'NORMAL',
          }));
          setRequests(requestsWithPriority);
        } else {
          setError(data.message || 'Failed to load requests');
        }
      } catch (err) {
        console.error('Fetch error:', err);
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, [authUser, statusFilter, typeFilter]);

  // Compute SLA status for a request
  const computeSLAStatus = (req: ClientRequest): SLAStatus => {
    return getRequestSLAStatus(
      {
        status: req.status,
        priority: req.priority as LibRequestPriority | undefined,
        created_at: req.created_at,
      } as Parameters<typeof getRequestSLAStatus>[0],
      now
    );
  };

  // Count breached requests (for warning banner)
  const breachedCount = useMemo(() => {
    return requests.filter((r) => computeSLAStatus(r) === 'BREACHED').length;
  }, [requests, now]);

  // Sorted and filtered requests
  const sortedRequests = useMemo(() => {
    let filtered = requests;

    // Apply priority filter
    if (priorityFilter) {
      filtered = filtered.filter((r) => r.priority === priorityFilter);
    }

    // Apply SLA filter
    if (slaFilter) {
      filtered = filtered.filter((r) => computeSLAStatus(r) === slaFilter);
    }

    // Sort
    return [...filtered].sort((a, b) => {
      if (sortMode === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortMode === 'priority') {
        const priorityDiff = PRIORITY_ORDER[a.priority || 'NORMAL'] - PRIORITY_ORDER[b.priority || 'NORMAL'];
        if (priorityDiff !== 0) return priorityDiff;
        // Secondary sort: oldest first within same priority
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      // Default: newest first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [requests, priorityFilter, slaFilter, sortMode, now]);

  const handleSetStatus = async (requestId: string, orgId: string, status: string, reason?: string) => {
    setActionLoading(requestId);
    try {
      const res = await fetch('/api/admin/client-requests/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          org_id: orgId,
          status,
          reason,
        }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        setRequests((prev) =>
          prev.map((r) =>
            r.request_id === requestId
              ? { ...r, status, status_reason: reason || r.status_reason }
              : r
          )
        );
        setRejectingId(null);
        setRejectReason('');
      } else {
        showError(data.message || 'Failed to update status');
      }
    } catch (err) {
      console.error('Status update error:', err);
      showError('Network error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetPriority = async (requestId: string, orgId: string, priority: RequestPriority) => {
    setActionLoading(requestId);
    try {
      const res = await fetch('/api/admin/client-requests/priority', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          org_id: orgId,
          priority,
        }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        setRequests((prev) =>
          prev.map((r) =>
            r.request_id === requestId ? { ...r, priority } : r
          )
        );
      } else {
        showError(data.message || 'Failed to update priority');
      }
    } catch (err) {
      console.error('Priority update error:', err);
      showError('Network error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleConvert = async (requestId: string, orgId: string) => {
    if (!confirm('Convert this request to a pipeline video?')) return;

    setActionLoading(requestId);
    try {
      const res = await fetch('/api/admin/client-requests/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          org_id: orgId,
        }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        setRequests((prev) =>
          prev.map((r) =>
            r.request_id === requestId
              ? { ...r, status: 'CONVERTED', video_id: data.data.video_id }
              : r
          )
        );
        showSuccess(`Video created: ${data.data.video_id}`);
      } else {
        showError(data.message || 'Failed to convert');
      }
    } catch (err) {
      console.error('Convert error:', err);
      showError('Network error');
    } finally {
      setActionLoading(null);
    }
  };

  if (authLoading) {
    return (
      <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
        <p>Checking access...</p>
      </div>
    );
  }

  if (!authUser?.isAdmin) {
    return (
      <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
        <p>Admin access required.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }} className="pb-24 lg:pb-6">

      <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '20px 0' }}>
        Client Requests
      </h1>

      {/* Filters and Sort */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '6px 12px',
            borderRadius: '4px',
            border: '1px solid #ced4da',
            fontSize: '14px',
          }}
        >
          <option value="">All Statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="CONVERTED">Converted</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{
            padding: '6px 12px',
            borderRadius: '4px',
            border: '1px solid #ced4da',
            fontSize: '14px',
          }}
        >
          <option value="">All Types</option>
          <option value="AI_CONTENT">AI Content</option>
          <option value="UGC_EDIT">UGC Edit</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          style={{
            padding: '6px 12px',
            borderRadius: '4px',
            border: '1px solid #ced4da',
            fontSize: '14px',
          }}
        >
          <option value="">All Priorities</option>
          <option value="HIGH">High</option>
          <option value="NORMAL">Normal</option>
          <option value="LOW">Low</option>
        </select>

        <select
          value={slaFilter}
          onChange={(e) => setSlaFilter(e.target.value)}
          style={{
            padding: '6px 12px',
            borderRadius: '4px',
            border: slaFilter === 'BREACHED' ? '1px solid #ff8787' : '1px solid #ced4da',
            backgroundColor: slaFilter === 'BREACHED' ? '#ffe3e3' : 'white',
            fontSize: '14px',
          }}
        >
          <option value="">All SLA Status</option>
          <option value="OK">SLA OK</option>
          <option value="WARNING">SLA Warning</option>
          <option value="BREACHED">SLA Breached</option>
        </select>

        <div style={{ borderLeft: '1px solid #ced4da', height: '24px', margin: '0 4px' }} />

        <span style={{ fontSize: '13px', color: '#495057' }}>Sort:</span>
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          style={{
            padding: '6px 12px',
            borderRadius: '4px',
            border: '1px solid #ced4da',
            fontSize: '14px',
          }}
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="priority">Priority (High → Low)</option>
        </select>
      </div>

      {error && (
        <div style={{ padding: '12px', backgroundColor: '#ffe3e3', color: '#e03131', borderRadius: '4px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* SLA Breach Warning Banner */}
      {!loading && breachedCount > 0 && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#fff3bf',
          border: '1px solid #ffc078',
          borderRadius: '6px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ fontSize: '16px' }}>&#9888;</span>
          <span style={{ color: '#e67700', fontWeight: 500 }}>
            {breachedCount} request{breachedCount !== 1 ? 's' : ''} past SLA
          </span>
          <button type="button"
            onClick={() => setSlaFilter('BREACHED')}
            style={{
              marginLeft: 'auto',
              padding: '4px 10px',
              fontSize: '12px',
              backgroundColor: '#e67700',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Show Breached
          </button>
        </div>
      )}

      {loading ? (
        <p>Loading requests...</p>
      ) : sortedRequests.length === 0 ? (
        <p style={{ color: '#868e96' }}>No requests found.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', textAlign: 'left' }}>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6' }}>Priority</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6' }}>SLA</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6' }}>Request ID</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6' }}>Org</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6' }}>Type</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6' }}>Title</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6' }}>Status</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6' }}>Age</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRequests.map((req) => {
                const statusColor = STATUS_COLORS[req.status] || STATUS_COLORS.SUBMITTED;
                const priorityColor = PRIORITY_COLORS[req.priority || 'NORMAL'];
                const slaStatus = computeSLAStatus(req);
                const slaColor = SLA_STATUS_COLORS[slaStatus];
                const isActioning = actionLoading === req.request_id;
                const isRejecting = rejectingId === req.request_id;
                const ageMs = now - new Date(req.created_at).getTime();
                const isBreached = slaStatus === 'BREACHED';

                return (
                  <tr
                    key={req.request_id}
                    style={{
                      borderBottom: '1px solid #dee2e6',
                      backgroundColor: isBreached ? '#fff5f5' : undefined,
                    }}
                  >
                    <td style={{ padding: '10px' }}>
                      <select
                        value={req.priority || 'NORMAL'}
                        onChange={(e) => handleSetPriority(req.request_id, req.org_id, e.target.value as RequestPriority)}
                        disabled={isActioning || req.status === 'CONVERTED'}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: priorityColor.bg,
                          color: priorityColor.text,
                          border: `1px solid ${priorityColor.border}`,
                          borderRadius: '4px',
                          cursor: req.status === 'CONVERTED' ? 'default' : 'pointer',
                          opacity: isActioning ? 0.6 : 1,
                        }}
                      >
                        <option value="HIGH">HIGH</option>
                        <option value="NORMAL">NORMAL</option>
                        <option value="LOW">LOW</option>
                      </select>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: slaColor.bg,
                        color: slaColor.text,
                        border: `1px solid ${slaColor.border}`,
                      }}>
                        {slaStatus}
                      </span>
                    </td>
                    <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '12px' }}>
                      {req.request_id.slice(0, 8)}...
                    </td>
                    <td style={{ padding: '10px' }}>{req.org_name}</td>
                    <td style={{ padding: '10px' }}>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        backgroundColor: req.request_type === 'AI_CONTENT' ? '#e7f5ff' : '#fff3bf',
                        color: req.request_type === 'AI_CONTENT' ? '#1971c2' : '#e67700',
                      }}>
                        {TYPE_LABELS[req.request_type]}
                      </span>
                    </td>
                    <td style={{ padding: '10px', maxWidth: '200px' }}>
                      <div style={{ fontWeight: 500, marginBottom: '2px' }}>{req.title}</div>
                      <div style={{ fontSize: '12px', color: '#868e96', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {req.brief.slice(0, 60)}{req.brief.length > 60 ? '...' : ''}
                      </div>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 500,
                        backgroundColor: statusColor.bg,
                        color: statusColor.text,
                      }}>
                        {STATUS_LABELS[req.status]}
                      </span>
                      {req.status === 'CONVERTED' && req.video_id && (
                        <Link
                          href={`/admin/pipeline?video=${req.video_id}`}
                          style={{ marginLeft: '6px', fontSize: '11px', color: '#9c36b5' }}
                        >
                          View
                        </Link>
                      )}
                    </td>
                    <td style={{ padding: '10px', fontSize: '12px', color: '#495057' }}>
                      <div>{hydrated ? formatAge(ageMs) : formatDateString(req.created_at)}</div>
                      <div style={{ fontSize: '10px', color: '#868e96' }}>since submit</div>
                    </td>
                    <td style={{ padding: '10px' }}>
                      {req.status === 'CONVERTED' ? (
                        <span style={{ color: '#868e96', fontSize: '12px' }}>Done</span>
                      ) : isRejecting ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <input
                            type="text"
                            placeholder="Rejection reason..."
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            style={{
                              padding: '4px 8px',
                              fontSize: '12px',
                              border: '1px solid #ced4da',
                              borderRadius: '4px',
                              width: '150px',
                            }}
                          />
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button type="button"
                              onClick={() => handleSetStatus(req.request_id, req.org_id, 'REJECTED', rejectReason)}
                              disabled={isActioning}
                              style={{
                                padding: '4px 8px',
                                fontSize: '11px',
                                backgroundColor: '#e03131',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: isActioning ? 'wait' : 'pointer',
                                opacity: isActioning ? 0.6 : 1,
                              }}
                            >
                              Confirm
                            </button>
                            <button type="button"
                              onClick={() => { setRejectingId(null); setRejectReason(''); }}
                              style={{
                                padding: '4px 8px',
                                fontSize: '11px',
                                backgroundColor: '#f1f3f5',
                                color: '#495057',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {req.status === 'SUBMITTED' && (
                            <button type="button"
                              onClick={() => handleSetStatus(req.request_id, req.org_id, 'IN_REVIEW')}
                              disabled={isActioning}
                              style={{
                                padding: '4px 8px',
                                fontSize: '11px',
                                backgroundColor: '#fff3bf',
                                color: '#e67700',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: isActioning ? 'wait' : 'pointer',
                                opacity: isActioning ? 0.6 : 1,
                              }}
                            >
                              Review
                            </button>
                          )}
                          {(req.status === 'SUBMITTED' || req.status === 'IN_REVIEW') && (
                            <>
                              <button type="button"
                                onClick={() => handleSetStatus(req.request_id, req.org_id, 'APPROVED')}
                                disabled={isActioning}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  backgroundColor: '#d3f9d8',
                                  color: '#2f9e44',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: isActioning ? 'wait' : 'pointer',
                                  opacity: isActioning ? 0.6 : 1,
                                }}
                              >
                                Approve
                              </button>
                              <button type="button"
                                onClick={() => setRejectingId(req.request_id)}
                                disabled={isActioning}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  backgroundColor: '#ffe3e3',
                                  color: '#e03131',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: isActioning ? 'wait' : 'pointer',
                                  opacity: isActioning ? 0.6 : 1,
                                }}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {req.status === 'APPROVED' && (
                            <button type="button"
                              onClick={() => handleConvert(req.request_id, req.org_id)}
                              disabled={isActioning}
                              style={{
                                padding: '4px 8px',
                                fontSize: '11px',
                                backgroundColor: '#f3d9fa',
                                color: '#9c36b5',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: isActioning ? 'wait' : 'pointer',
                                opacity: isActioning ? 0.6 : 1,
                              }}
                            >
                              Convert
                            </button>
                          )}
                          {req.status === 'REJECTED' && (
                            <button type="button"
                              onClick={() => handleSetStatus(req.request_id, req.org_id, 'IN_REVIEW')}
                              disabled={isActioning}
                              style={{
                                padding: '4px 8px',
                                fontSize: '11px',
                                backgroundColor: '#e7f5ff',
                                color: '#1971c2',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: isActioning ? 'wait' : 'pointer',
                                opacity: isActioning ? 0.6 : 1,
                              }}
                            >
                              Re-Review
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
