'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AdminNav from '../components/AdminNav';
import { useHydrated, formatDateString } from '@/lib/useHydrated';

interface AuthUser {
  id: string;
  email: string | null;
  isAdmin: boolean;
}

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

export default function AdminRequestsPage() {
  const hydrated = useHydrated();
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
          setRequests(data.data);
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
        // Update local state
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
        alert(data.message || 'Failed to update status');
      }
    } catch (err) {
      console.error('Status update error:', err);
      alert('Network error');
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
        // Update local state
        setRequests((prev) =>
          prev.map((r) =>
            r.request_id === requestId
              ? { ...r, status: 'CONVERTED', video_id: data.data.video_id }
              : r
          )
        );
        alert(`Video created: ${data.data.video_id}`);
      } else {
        alert(data.message || 'Failed to convert');
      }
    } catch (err) {
      console.error('Convert error:', err);
      alert('Network error');
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
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <AdminNav isAdmin={authUser.isAdmin} />

      <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '20px 0' }}>
        Client Requests
      </h1>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
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
      </div>

      {error && (
        <div style={{ padding: '12px', backgroundColor: '#ffe3e3', color: '#e03131', borderRadius: '4px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <p>Loading requests...</p>
      ) : requests.length === 0 ? (
        <p style={{ color: '#868e96' }}>No requests found.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', textAlign: 'left' }}>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6' }}>Request ID</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6' }}>Org</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6' }}>Type</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6' }}>Title</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6' }}>Status</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6' }}>Created</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => {
                const statusColor = STATUS_COLORS[req.status] || STATUS_COLORS.SUBMITTED;
                const isActioning = actionLoading === req.request_id;
                const isRejecting = rejectingId === req.request_id;

                return (
                  <tr key={req.request_id} style={{ borderBottom: '1px solid #dee2e6' }}>
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
                      {hydrated ? formatDateString(req.created_at) : req.created_at.split('T')[0]}
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
                            <button
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
                            <button
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
                            <button
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
                              <button
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
                              <button
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
                            <button
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
                            <button
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
