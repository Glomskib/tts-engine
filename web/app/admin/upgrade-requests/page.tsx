'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useHydrated, formatDateString } from '@/lib/useHydrated';

interface UpgradeRequest {
  id: string;
  user_id: string;
  email: string | null;
  message: string | null;
  created_at: string;
  status: 'pending' | 'approved' | 'denied';
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

export default function AdminUpgradeRequestsPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [requests, setRequests] = useState<UpgradeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState<{ id: string; note: string } | null>(null);

  // Fetch authenticated user and check admin status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/upgrade-requests');
          return;
        }

        // Check if admin
        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();

        if (roleData.role !== 'admin') {
          router.push('/admin/pipeline');
          return;
        }

        setIsAdmin(true);
      } catch (err) {
        console.error('Auth error:', err);
        router.push('/login?redirect=/admin/upgrade-requests');
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // Fetch upgrade requests
  const fetchRequests = async () => {
    try {
      const res = await fetch('/api/admin/upgrade-requests?limit=100');
      const data = await res.json();

      if (data.ok) {
        setRequests(data.data.requests);
        setError('');
      } else {
        setError(data.error || 'Failed to load requests');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchRequests();
    }
  }, [isAdmin]);

  // Resolve a request
  const handleResolve = async (requestId: string, decision: 'approved' | 'denied', note?: string) => {
    setResolvingId(requestId);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/upgrade-requests/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_event_id: requestId,
          decision,
          note: note || null,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setMessage({
          type: 'success',
          text: `Request ${decision}${decision === 'approved' ? ' - user upgraded to Pro' : ''}`,
        });
        setNoteInput(null);
        // Refresh list
        await fetchRequests();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to resolve request' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setResolvingId(null);
    }
  };

  if (authLoading) {
    return <div style={{ padding: '20px' }}>Checking access...</div>;
  }

  if (!isAdmin) {
    return <div style={{ padding: '20px' }}>Redirecting...</div>;
  }

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const resolvedRequests = requests.filter(r => r.status !== 'pending');

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }} className="pb-24 lg:pb-6">

      {/* Header */}
      <h1 style={{ margin: '0 0 20px 0' }}>Upgrade Requests</h1>

      {/* Stats */}
      <div style={{
        display: 'flex',
        gap: '20px',
        marginBottom: '20px',
      }}>
        <div style={{
          padding: '15px 25px',
          backgroundColor: pendingRequests.length > 0 ? '#fff3bf' : '#d3f9d8',
          borderRadius: '8px',
          border: `1px solid ${pendingRequests.length > 0 ? '#ffd43b' : '#69db7c'}`,
        }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: pendingRequests.length > 0 ? '#e67700' : '#2b8a3e' }}>
            {pendingRequests.length}
          </div>
          <div style={{ fontSize: '13px', color: '#6c757d' }}>Pending</div>
        </div>
        <div style={{
          padding: '15px 25px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6',
        }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#495057' }}>
            {requests.length}
          </div>
          <div style={{ fontSize: '13px', color: '#6c757d' }}>Total</div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          marginBottom: '15px',
          padding: '12px 16px',
          backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
          color: message.type === 'success' ? '#155724' : '#721c24',
          borderRadius: '4px',
          border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`,
        }}>
          {message.text}
        </div>
      )}

      {/* Loading/Error */}
      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          Loading requests...
        </div>
      )}

      {error && (
        <div style={{
          padding: '20px',
          backgroundColor: '#f8d7da',
          borderRadius: '4px',
          color: '#721c24',
        }}>
          {error}
        </div>
      )}

      {/* Pending Requests */}
      {!loading && !error && (
        <>
          <h2 style={{ margin: '0 0 15px 0', fontSize: '18px' }}>
            Pending Requests ({pendingRequests.length})
          </h2>

          {pendingRequests.length === 0 ? (
            <div style={{
              padding: '30px',
              textAlign: 'center',
              backgroundColor: '#d3f9d8',
              borderRadius: '8px',
              border: '1px solid #69db7c',
              marginBottom: '30px',
            }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#2b8a3e' }}>
                No pending requests
              </div>
              <div style={{ color: '#37b24d', marginTop: '5px' }}>
                All upgrade requests have been processed.
              </div>
            </div>
          ) : (
            <div style={{
              border: '1px solid #dee2e6',
              borderRadius: '8px',
              overflow: 'hidden',
              marginBottom: '30px',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>User</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Message</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Requested</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRequests.map((req) => (
                    <tr key={req.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 'bold' }}>{req.email || 'No email'}</div>
                        <div style={{ fontSize: '12px', color: '#6c757d', fontFamily: 'monospace' }}>
                          {req.user_id.slice(0, 8)}...
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', maxWidth: '300px' }}>
                        <div style={{
                          fontSize: '13px',
                          color: req.message ? '#495057' : '#adb5bd',
                          fontStyle: req.message ? 'normal' : 'italic',
                        }}>
                          {req.message || '(no message)'}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6c757d' }}>
                        {hydrated && formatDateString(req.created_at)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        {noteInput?.id === req.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                            <input
                              type="text"
                              value={noteInput.note}
                              onChange={(e) => setNoteInput({ id: req.id, note: e.target.value })}
                              placeholder="Note (optional)"
                              style={{
                                padding: '6px 10px',
                                border: '1px solid #ced4da',
                                borderRadius: '4px',
                                fontSize: '12px',
                                width: '150px',
                              }}
                            />
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => handleResolve(req.id, 'approved', noteInput.note)}
                                disabled={resolvingId === req.id}
                                style={{
                                  padding: '6px 12px',
                                  backgroundColor: resolvingId === req.id ? '#adb5bd' : '#28a745',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: resolvingId === req.id ? 'not-allowed' : 'pointer',
                                  fontSize: '11px',
                                }}
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setNoteInput(null)}
                                style={{
                                  padding: '6px 12px',
                                  backgroundColor: '#6c757d',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <button
                              onClick={() => setNoteInput({ id: req.id, note: '' })}
                              disabled={resolvingId === req.id}
                              style={{
                                padding: '6px 14px',
                                backgroundColor: resolvingId === req.id ? '#adb5bd' : '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: resolvingId === req.id ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                fontWeight: 'bold',
                              }}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleResolve(req.id, 'denied')}
                              disabled={resolvingId === req.id}
                              style={{
                                padding: '6px 14px',
                                backgroundColor: resolvingId === req.id ? '#adb5bd' : '#dc3545',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: resolvingId === req.id ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                fontWeight: 'bold',
                              }}
                            >
                              Deny
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Resolved Requests */}
          {resolvedRequests.length > 0 && (
            <>
              <h2 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#6c757d' }}>
                Resolved ({resolvedRequests.length})
              </h2>
              <div style={{
                border: '1px solid #dee2e6',
                borderRadius: '8px',
                overflow: 'hidden',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa' }}>
                      <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #dee2e6', fontSize: '13px' }}>User</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #dee2e6', fontSize: '13px' }}>Requested</th>
                      <th style={{ padding: '10px 16px', textAlign: 'center', borderBottom: '1px solid #dee2e6', fontSize: '13px' }}>Status</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #dee2e6', fontSize: '13px' }}>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resolvedRequests.slice(0, 20).map((req) => (
                      <tr key={req.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                        <td style={{ padding: '10px 16px', fontSize: '13px' }}>
                          {req.email || req.user_id.slice(0, 8) + '...'}
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: '12px', color: '#6c757d' }}>
                          {hydrated && formatDateString(req.created_at)}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                          <span style={{
                            padding: '3px 10px',
                            backgroundColor: req.status === 'approved' ? '#d3f9d8' : '#f8d7da',
                            color: req.status === 'approved' ? '#2b8a3e' : '#721c24',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                          }}>
                            {req.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: '12px', color: '#6c757d' }}>
                          {req.resolution_note || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
