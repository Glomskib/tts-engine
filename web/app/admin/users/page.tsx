'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { EmptyState } from '../components/AdminPageLayout';

interface User {
  user_id: string;
  email: string | null;
  role: string | null;
  created_at: string | null;
  plan: 'free' | 'pro';
  is_active: boolean;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [gatingEnabled, setGatingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);

  // Fetch authenticated user and check admin status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/users');
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
        router.push('/login?redirect=/admin/users');
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // Fetch users
  useEffect(() => {
    if (!isAdmin) return;

    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/admin/users');
        const data = await res.json();

        if (data.ok) {
          setUsers(data.data.users);
          setGatingEnabled(data.data.gating_enabled);
          setError('');
        } else {
          setError(data.error || 'Failed to load users');
        }
      } catch {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [isAdmin]);

  // Set plan for user
  const handleSetPlan = async (userId: string, newPlan: 'free' | 'pro') => {
    setUpdatingUser(userId);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/users/set-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, plan: newPlan }),
      });

      const data = await res.json();

      if (data.ok) {
        // Update local state
        setUsers(prev => prev.map(u =>
          u.user_id === userId ? { ...u, plan: newPlan, is_active: true } : u
        ));
        setMessage({ type: 'success', text: `Plan updated to ${newPlan.toUpperCase()}` });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update plan' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setUpdatingUser(null);
    }
  };

  if (authLoading) {
    return <div style={{ padding: '20px' }}>Checking access...</div>;
  }

  if (!isAdmin) {
    return <div style={{ padding: '20px' }}>Redirecting...</div>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }} className="pb-24 lg:pb-6">

      {/* Header */}
      <h1 style={{ margin: '0 0 20px 0' }}>User Management</h1>

      {/* Gating Status */}
      <div style={{
        marginBottom: '20px',
        padding: '15px 20px',
        backgroundColor: gatingEnabled ? '#fff3bf' : '#d3f9d8',
        borderRadius: '6px',
        border: `1px solid ${gatingEnabled ? '#ffd43b' : '#69db7c'}`,
      }}>
        <strong>Subscription Gating:</strong>{' '}
        {gatingEnabled ? (
          <span style={{ color: '#e67700' }}>
            Enabled - Pro subscription required for workbench actions
          </span>
        ) : (
          <span style={{ color: '#2b8a3e' }}>
            Disabled - All users have full access (set SUBSCRIPTION_GATING_ENABLED=true to enable)
          </span>
        )}
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
          Loading users...
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

      {/* Users Table */}
      {!loading && !error && (
        <div style={{
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>User</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Role</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Plan</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 0 }}>
                    <EmptyState
                      title="No users found"
                      description="Users will appear here once they sign up and complete authentication."
                    />
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.user_id} style={{ borderBottom: '1px solid #dee2e6' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 'bold' }}>{user.email || 'No email'}</div>
                      <div style={{ fontSize: '12px', color: '#6c757d', fontFamily: 'monospace' }}>
                        {user.user_id.slice(0, 8)}...
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '4px 10px',
                        backgroundColor: user.role === 'admin' ? '#e7f5ff' : '#f8f9fa',
                        border: `1px solid ${user.role === 'admin' ? '#74c0fc' : '#dee2e6'}`,
                        borderRadius: '4px',
                        fontSize: '12px',
                        textTransform: 'capitalize',
                      }}>
                        {user.role || 'none'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 12px',
                        backgroundColor: user.plan === 'pro' ? '#d3f9d8' : '#f8f9fa',
                        color: user.plan === 'pro' ? '#2b8a3e' : '#495057',
                        border: `1px solid ${user.plan === 'pro' ? '#69db7c' : '#dee2e6'}`,
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}>
                        {user.plan.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {user.plan === 'free' ? (
                        <button type="button"
                          onClick={() => handleSetPlan(user.user_id, 'pro')}
                          disabled={updatingUser === user.user_id}
                          style={{
                            padding: '6px 14px',
                            backgroundColor: updatingUser === user.user_id ? '#adb5bd' : '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: updatingUser === user.user_id ? 'not-allowed' : 'pointer',
                            fontSize: '12px',
                            fontWeight: 'bold',
                          }}
                        >
                          {updatingUser === user.user_id ? 'Updating...' : 'Upgrade to Pro'}
                        </button>
                      ) : (
                        <button type="button"
                          onClick={() => handleSetPlan(user.user_id, 'free')}
                          disabled={updatingUser === user.user_id}
                          style={{
                            padding: '6px 14px',
                            backgroundColor: updatingUser === user.user_id ? '#adb5bd' : '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: updatingUser === user.user_id ? 'not-allowed' : 'pointer',
                            fontSize: '12px',
                            fontWeight: 'bold',
                          }}
                        >
                          {updatingUser === user.user_id ? 'Updating...' : 'Downgrade to Free'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* User Count */}
      {!loading && !error && users.length > 0 && (
        <div style={{
          marginTop: '15px',
          color: '#6c757d',
          fontSize: '13px',
        }}>
          Total: {users.length} user(s) | Pro: {users.filter(u => u.plan === 'pro').length} | Free: {users.filter(u => u.plan === 'free').length}
        </div>
      )}
    </div>
  );
}
