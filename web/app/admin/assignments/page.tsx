'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useHydrated, formatDateString } from '@/lib/useHydrated';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { EmptyState } from '../components/AdminPageLayout';

type SlaStatus = 'on_track' | 'due_soon' | 'overdue';

interface Assignment {
  video_id: string;
  recording_status: string;
  assignment_state: string;
  assigned_to: string | null;
  assigned_role: string | null;
  assigned_at: string | null;
  assigned_expires_at: string | null;
  time_left_minutes: number | null;
  is_expired: boolean;
  is_expiring_soon: boolean;
  work_lane: string | null;
  work_priority: number | null;
  sla_status: SlaStatus;
  priority_score: number;
}

interface UserActivity {
  user_id: string;
  email: string | null;
  role: string | null;
  last_active_at: string | null;
  stats_7d: {
    assignments_completed: number;
    assignments_expired: number;
    status_changes: number;
    total_events: number;
  };
}

interface AuthUser {
  id: string;
  email: string | null;
  role: string | null;
}

const STATE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  ASSIGNED: { bg: '#d3f9d8', text: '#2b8a3e', border: '#69db7c' },
  EXPIRED: { bg: '#ffe3e3', text: '#c92a2a', border: '#ffa8a8' },
  COMPLETED: { bg: '#e7f5ff', text: '#1971c2', border: '#74c0fc' },
  UNASSIGNED: { bg: '#f8f9fa', text: '#495057', border: '#dee2e6' },
};

const ROLE_COLORS: Record<string, string> = {
  recorder: '#228be6',
  editor: '#fab005',
  uploader: '#40c057',
  admin: '#7950f2',
};

function formatTimeLeft(minutes: number | null): string {
  if (minutes === null) return '-';
  if (minutes < 0) return 'Expired';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function AssignmentsPage() {
  const hydrated = useHydrated();
  const router = useRouter();

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [userActivity, setUserActivity] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters
  const [roleFilter, setRoleFilter] = useState('any');
  const [stateFilter, setStateFilter] = useState('ASSIGNED');
  const [sortBy, setSortBy] = useState('expires_soon');

  // Modal state
  const [extendModal, setExtendModal] = useState<{ videoId: string; currentExpires: string | null } | null>(null);
  const [extendTtl, setExtendTtl] = useState(60);
  const [extending, setExtending] = useState(false);

  const [reassignModal, setReassignModal] = useState<{ videoId: string; currentAssignee: string | null } | null>(null);
  const [reassignUserId, setReassignUserId] = useState('');
  const [reassignRole, setReassignRole] = useState('recorder');
  const [reassignTtl, setReassignTtl] = useState(240);
  const [reassignNotes, setReassignNotes] = useState('');
  const [reassigning, setReassigning] = useState(false);

  // Fetch authenticated user
  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/assignments');
          return;
        }

        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();

        const userRole = roleData.role as string | null;

        // Admin-only page
        if (userRole !== 'admin') {
          if (userRole === 'recorder' || userRole === 'editor' || userRole === 'uploader') {
            router.push(`/admin/${userRole}`);
          } else {
            router.push('/admin/pipeline');
          }
          return;
        }

        setAuthUser({
          id: user.id,
          email: user.email || null,
          role: userRole,
        });
      } catch (err) {
        console.error('Auth error:', err);
        router.push('/login?redirect=/admin/assignments');
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router]);

  // Fetch assignments
  const fetchAssignments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (roleFilter !== 'any') params.set('role', roleFilter);
      if (stateFilter !== 'any') params.set('state', stateFilter);
      params.set('sort', sortBy);
      params.set('limit', '100');

      const res = await fetch(`/api/admin/assignments?${params.toString()}`);
      const data = await res.json();

      if (data.ok) {
        setAssignments(data.data || []);
      } else {
        setError(data.error || 'Failed to load assignments');
      }
    } catch {
      setError('Network error loading assignments');
    }
  }, [roleFilter, stateFilter, sortBy]);

  // Fetch user activity
  const fetchUserActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/user-activity?limit=20');
      const data = await res.json();

      if (data.ok) {
        setUserActivity(data.data?.users || []);
      }
    } catch (err) {
      console.error('Failed to load user activity:', err);
    }
  }, []);

  // Load data
  useEffect(() => {
    if (!authUser) return;

    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchAssignments(), fetchUserActivity()]);
      setLoading(false);
    };

    loadData();
  }, [authUser, fetchAssignments, fetchUserActivity]);

  // Extend assignment
  const handleExtend = async () => {
    if (!extendModal) return;

    setExtending(true);
    try {
      const res = await fetch(`/api/admin/assignments/${extendModal.videoId}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl_minutes: extendTtl }),
      });
      const data = await res.json();

      if (data.ok) {
        setMessage({ type: 'success', text: `Extended by ${extendTtl} minutes` });
        setExtendModal(null);
        fetchAssignments();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to extend' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setExtending(false);
    }
  };

  // Reassign assignment
  const handleReassign = async () => {
    if (!reassignModal) return;

    if (!reassignUserId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      setMessage({ type: 'error', text: 'Invalid user ID format' });
      return;
    }

    setReassigning(true);
    try {
      const res = await fetch(`/api/admin/assignments/${reassignModal.videoId}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_user_id: reassignUserId,
          to_role: reassignRole,
          ttl_minutes: reassignTtl,
          notes: reassignNotes || undefined,
        }),
      });
      const data = await res.json();

      if (data.ok) {
        setMessage({ type: 'success', text: 'Reassigned successfully' });
        setReassignModal(null);
        setReassignUserId('');
        setReassignNotes('');
        fetchAssignments();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to reassign' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setReassigning(false);
    }
  };

  // Sweep expired
  const handleSweep = async () => {
    try {
      const res = await fetch('/api/admin/sweep-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();

      if (data.ok) {
        setMessage({ type: 'success', text: `Swept ${data.expired_count} expired assignment(s)` });
        fetchAssignments();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to sweep' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    }
  };

  if (authLoading) {
    return <div style={{ padding: '20px' }}>Checking access...</div>;
  }

  if (!authUser) {
    return <div style={{ padding: '20px' }}>Redirecting...</div>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }} className="pb-24 lg:pb-6">

      {/* Header */}
      <h1 style={{ margin: '0 0 20px 0' }}>Assignment Dashboard</h1>

      {/* User info */}
      <div style={{
        marginBottom: '20px',
        padding: '10px 15px',
        backgroundColor: '#f3f0ff',
        borderRadius: '4px',
        border: '1px solid #b197fc',
        fontSize: '13px',
      }}>
        <strong>{authUser.email || authUser.id.slice(0, 8)}</strong>
        <span style={{ marginLeft: '10px', padding: '2px 8px', backgroundColor: '#fff', borderRadius: '4px' }}>Admin</span>
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
          <button
            onClick={() => setMessage(null)}
            style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            x
          </button>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <button
          onClick={handleSweep}
          style={{
            padding: '8px 16px',
            backgroundColor: '#ff6b6b',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Sweep Expired
        </button>
        <button
          onClick={() => { fetchAssignments(); fetchUserActivity(); }}
          style={{
            padding: '8px 16px',
            backgroundColor: '#228be6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{
        marginBottom: '20px',
        padding: '15px',
        backgroundColor: '#f8f9fa',
        borderRadius: '4px',
        display: 'flex',
        gap: '20px',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 'bold', marginRight: '8px' }}>Role:</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            <option value="any">Any</option>
            <option value="recorder">Recorder</option>
            <option value="editor">Editor</option>
            <option value="uploader">Uploader</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 'bold', marginRight: '8px' }}>State:</label>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            <option value="any">Any</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="EXPIRED">Expired</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 'bold', marginRight: '8px' }}>Sort:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            <option value="expires_soon">Expires Soon</option>
            <option value="priority">Priority</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          Loading...
        </div>
      )}

      {/* Assignments table */}
      {!loading && (
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{ fontSize: '16px', marginBottom: '10px' }}>
            Assignments ({assignments.length})
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Video</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Status</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>State</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Role</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Assignee</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Time Left</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Priority</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignments.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 0 }}>
                      <EmptyState
                        title="No assignments found"
                        description={roleFilter !== 'any' || stateFilter !== 'any'
                          ? "Try adjusting your filters to see more results."
                          : "Assignments will appear here when videos are dispatched to workers."}
                      />
                    </td>
                  </tr>
                ) : (
                  assignments.map((a) => {
                    const stateColor = STATE_COLORS[a.assignment_state] || STATE_COLORS.UNASSIGNED;
                    const roleColor = ROLE_COLORS[a.assigned_role || ''] || '#6c757d';

                    return (
                      <tr key={a.video_id} style={{ borderBottom: '1px solid #dee2e6' }}>
                        <td style={{ padding: '10px' }}>
                          <Link
                            href={`/admin/pipeline/${a.video_id}`}
                            style={{ fontFamily: 'monospace', color: '#228be6' }}
                          >
                            {a.video_id.slice(0, 8)}...
                          </Link>
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span style={{
                            padding: '2px 8px',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '4px',
                            fontSize: '11px',
                          }}>
                            {a.recording_status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span style={{
                            padding: '2px 8px',
                            backgroundColor: stateColor.bg,
                            color: stateColor.text,
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                          }}>
                            {a.assignment_state}
                          </span>
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span style={{
                            padding: '2px 8px',
                            backgroundColor: roleColor,
                            color: 'white',
                            borderRadius: '4px',
                            fontSize: '11px',
                            textTransform: 'capitalize',
                          }}>
                            {a.assigned_role || '-'}
                          </span>
                        </td>
                        <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '11px' }}>
                          {a.assigned_to ? a.assigned_to.slice(0, 8) : '-'}
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span style={{
                            padding: '2px 8px',
                            backgroundColor: a.is_expired ? '#ffe3e3' : a.is_expiring_soon ? '#fff3bf' : '#f8f9fa',
                            color: a.is_expired ? '#c92a2a' : a.is_expiring_soon ? '#e67700' : '#495057',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                          }}>
                            {formatTimeLeft(a.time_left_minutes)}
                          </span>
                        </td>
                        <td style={{ padding: '10px', fontSize: '11px' }}>
                          {a.work_priority ?? '-'}
                        </td>
                        <td style={{ padding: '10px' }}>
                          <div style={{ display: 'flex', gap: '5px' }}>
                            {a.assignment_state === 'ASSIGNED' && (
                              <>
                                <button
                                  onClick={() => setExtendModal({ videoId: a.video_id, currentExpires: a.assigned_expires_at })}
                                  style={{
                                    padding: '4px 8px',
                                    backgroundColor: '#40c057',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                  }}
                                >
                                  Extend
                                </button>
                                <button
                                  onClick={() => setReassignModal({ videoId: a.video_id, currentAssignee: a.assigned_to })}
                                  style={{
                                    padding: '4px 8px',
                                    backgroundColor: '#fab005',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                  }}
                                >
                                  Reassign
                                </button>
                              </>
                            )}
                            <Link
                              href={`/admin/pipeline/${a.video_id}`}
                              style={{
                                padding: '4px 8px',
                                backgroundColor: '#228be6',
                                color: 'white',
                                borderRadius: '4px',
                                textDecoration: 'none',
                                fontSize: '11px',
                              }}
                            >
                              Open
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* User activity panel */}
      {!loading && userActivity.length > 0 && (
        <div>
          <h2 style={{ fontSize: '16px', marginBottom: '10px' }}>User Activity (7 days)</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>User</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Role</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Last Active</th>
                  <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Completed</th>
                  <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Expired</th>
                  <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Changes</th>
                  <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {userActivity.map((u) => (
                  <tr key={u.user_id} style={{ borderBottom: '1px solid #dee2e6' }}>
                    <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '11px' }}>
                      {u.user_id.slice(0, 8)}...
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={{
                        padding: '2px 8px',
                        backgroundColor: ROLE_COLORS[u.role || ''] || '#6c757d',
                        color: 'white',
                        borderRadius: '4px',
                        fontSize: '11px',
                        textTransform: 'capitalize',
                      }}>
                        {u.role || '-'}
                      </span>
                    </td>
                    <td style={{ padding: '10px', fontSize: '11px' }}>
                      {hydrated && u.last_active_at ? formatDateString(u.last_active_at) : '-'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#2b8a3e' }}>
                      {u.stats_7d.assignments_completed}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: u.stats_7d.assignments_expired > 0 ? '#c92a2a' : '#495057' }}>
                      {u.stats_7d.assignments_expired}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      {u.stats_7d.status_changes}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      {u.stats_7d.total_events}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Extend modal */}
      {extendModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            minWidth: '300px',
          }}>
            <h3 style={{ margin: '0 0 15px 0' }}>Extend Assignment</h3>
            <p style={{ fontSize: '13px', color: '#6c757d', marginBottom: '15px' }}>
              Video: {extendModal.videoId.slice(0, 8)}...
            </p>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Extend by (minutes)
              </label>
              <input
                type="number"
                value={extendTtl}
                onChange={(e) => setExtendTtl(parseInt(e.target.value, 10) || 60)}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setExtendModal(null)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleExtend}
                disabled={extending}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#40c057',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: extending ? 'not-allowed' : 'pointer',
                }}
              >
                {extending ? 'Extending...' : 'Extend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign modal */}
      {reassignModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            minWidth: '350px',
          }}>
            <h3 style={{ margin: '0 0 15px 0' }}>Reassign Video</h3>
            <p style={{ fontSize: '13px', color: '#6c757d', marginBottom: '15px' }}>
              Video: {reassignModal.videoId.slice(0, 8)}...
            </p>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                New Assignee (User ID)
              </label>
              <input
                type="text"
                value={reassignUserId}
                onChange={(e) => setReassignUserId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }}
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Role
              </label>
              <select
                value={reassignRole}
                onChange={(e) => setReassignRole(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
              >
                <option value="recorder">Recorder</option>
                <option value="editor">Editor</option>
                <option value="uploader">Uploader</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                TTL (minutes)
              </label>
              <input
                type="number"
                value={reassignTtl}
                onChange={(e) => setReassignTtl(parseInt(e.target.value, 10) || 240)}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Notes (optional)
              </label>
              <textarea
                value={reassignNotes}
                onChange={(e) => setReassignNotes(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minHeight: '60px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setReassignModal(null); setReassignUserId(''); setReassignNotes(''); }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleReassign}
                disabled={reassigning}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#fab005',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: reassigning ? 'not-allowed' : 'pointer',
                }}
              >
                {reassigning ? 'Reassigning...' : 'Reassign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: '30px', color: '#999', fontSize: '12px', textAlign: 'center' }}>
        Assignment Dashboard - Admin Only
      </div>
    </div>
  );
}
