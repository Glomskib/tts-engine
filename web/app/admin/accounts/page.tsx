'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Plus, ToggleLeft, ToggleRight, BarChart3, Users, ExternalLink } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface PostingAccount {
  id: string;
  display_name: string;
  account_code: string;
  platform: string;
  is_active: boolean;
}

interface AccountStats {
  account_id: string;
  name: string;
  handle: string;
  videos: number;
  posted: number;
  views: number;
  likes: number;
  revenue: number;
  avg_engagement: number;
}

export default function AdminAccountsPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [accounts, setAccounts] = useState<PostingAccount[]>([]);
  const [stats, setStats] = useState<AccountStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) { router.push('/login'); return; }
        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();
        if (roleData.role !== 'admin') { router.push('/admin/pipeline'); return; }
      } catch {
        router.push('/login');
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [acctRes, statsRes] = await Promise.all([
        fetch('/api/posting-accounts?include_inactive=true', { credentials: 'include' }),
        fetch('/api/analytics?type=accounts', { credentials: 'include' }),
      ]);
      const acctData = await acctRes.json();
      const statsData = await statsRes.json();
      if (acctData.ok) setAccounts(acctData.data || []);
      if (statsData.ok) setStats(statsData.data?.accounts || []);
    } catch (err) {
      console.error('Failed to load accounts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading) fetchData();
  }, [authLoading, fetchData]);

  const handleCreate = async () => {
    if (!newName.trim() || !newCode.trim()) return;
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/posting-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ display_name: newName.trim(), account_code: newCode.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: 'success', text: `Account "${newName}" created!` });
        setNewName('');
        setNewCode('');
        setShowAddForm(false);
        fetchData();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create account' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (account: PostingAccount) => {
    try {
      const res = await fetch(`/api/posting-accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_active: !account.is_active }),
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  };

  const getStatsForAccount = (accountId: string): AccountStats | undefined => {
    return stats.find(s => s.account_id === accountId);
  };

  if (authLoading) return <div style={{ padding: '20px', color: '#a1a1aa' }}>Checking access...</div>;

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }} className="pb-24 lg:pb-6">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0', fontSize: '24px', color: '#fff' }}>Posting Accounts</h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#71717a' }}>
            Manage TikTok posting accounts and view performance
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            padding: '10px 20px',
            backgroundColor: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Plus size={16} />
          Add Account
        </button>
      </div>

      {/* Messages */}
      {message && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '13px',
          backgroundColor: message.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          color: message.type === 'success' ? '#4ade80' : '#f87171',
        }}>
          {message.text}
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <div style={{
          backgroundColor: '#18181b',
          border: '1px solid #27272a',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px',
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#e4e4e7' }}>New Posting Account</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Display Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. BKAdventures0"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: '#09090b',
                  border: '1px solid #27272a',
                  borderRadius: '6px',
                  color: '#e4e4e7',
                  fontSize: '14px',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Account Code</label>
              <input
                type="text"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="e.g. BKADV0"
                maxLength={8}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: '#09090b',
                  border: '1px solid #27272a',
                  borderRadius: '6px',
                  color: '#e4e4e7',
                  fontSize: '14px',
                  textTransform: 'uppercase',
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !newName.trim() || !newCode.trim()}
              style={{
                padding: '10px 20px',
                backgroundColor: creating ? '#1e40af' : '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: creating ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                opacity: creating || !newName.trim() || !newCode.trim() ? 0.6 : 1,
              }}
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#a1a1aa' }}>
          Loading accounts...
        </div>
      )}

      {/* Summary Cards */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Total Accounts</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#3b82f6' }}>{accounts.length}</div>
            <div style={{ fontSize: '11px', color: '#52525b' }}>{accounts.filter(a => a.is_active).length} active</div>
          </div>
          <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Total Videos</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#a855f7' }}>
              {stats.reduce((sum, s) => sum + s.videos, 0)}
            </div>
            <div style={{ fontSize: '11px', color: '#52525b' }}>{stats.reduce((sum, s) => sum + s.posted, 0)} posted</div>
          </div>
          <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Total Views</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#22c55e' }}>
              {stats.reduce((sum, s) => sum + s.views, 0).toLocaleString()}
            </div>
          </div>
          <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Total Revenue</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#f59e0b' }}>
              ${stats.reduce((sum, s) => sum + s.revenue, 0).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Accounts Grid */}
      {!loading && accounts.length === 0 && (
        <div style={{
          padding: '60px 20px',
          textAlign: 'center',
          backgroundColor: '#18181b',
          border: '1px solid #27272a',
          borderRadius: '8px',
        }}>
          <Users size={40} style={{ color: '#52525b', margin: '0 auto 12px' }} />
          <p style={{ color: '#a1a1aa', margin: '0 0 4px 0', fontSize: '16px' }}>No posting accounts</p>
          <p style={{ color: '#71717a', margin: 0, fontSize: '13px' }}>Add your first TikTok account to get started.</p>
        </div>
      )}

      {!loading && accounts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '16px' }}>
          {accounts.map((account) => {
            const acctStats = getStatsForAccount(account.id);
            return (
              <div
                key={account.id}
                style={{
                  backgroundColor: '#18181b',
                  border: `1px solid ${account.is_active ? '#27272a' : '#1c1917'}`,
                  borderRadius: '8px',
                  overflow: 'hidden',
                  opacity: account.is_active ? 1 : 0.6,
                }}
              >
                {/* Account Header */}
                <div style={{
                  padding: '16px',
                  borderBottom: '1px solid #27272a',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: '#e4e4e7' }}>
                      {account.display_name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#71717a', marginTop: '2px' }}>
                      {account.account_code} &bull; {account.platform}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleActive(account)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: account.is_active ? '#22c55e' : '#71717a',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                    }}
                    title={account.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {account.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    {account.is_active ? 'Active' : 'Inactive'}
                  </button>
                </div>

                {/* Stats */}
                <div style={{ padding: '16px' }}>
                  {acctStats ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#71717a' }}>Videos</div>
                        <div style={{ fontSize: '18px', fontWeight: 600, color: '#e4e4e7' }}>{acctStats.videos}</div>
                        <div style={{ fontSize: '10px', color: '#52525b' }}>{acctStats.posted} posted</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#71717a' }}>Views</div>
                        <div style={{ fontSize: '18px', fontWeight: 600, color: '#22c55e' }}>
                          {acctStats.views >= 1000 ? `${(acctStats.views / 1000).toFixed(1)}K` : acctStats.views}
                        </div>
                        <div style={{ fontSize: '10px', color: '#52525b' }}>{acctStats.avg_engagement}% eng</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#71717a' }}>Revenue</div>
                        <div style={{ fontSize: '18px', fontWeight: 600, color: '#f59e0b' }}>${acctStats.revenue}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', color: '#52525b', textAlign: 'center', padding: '8px 0' }}>
                      No performance data yet
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{
                  padding: '12px 16px',
                  borderTop: '1px solid #27272a',
                  display: 'flex',
                  gap: '8px',
                }}>
                  <a
                    href={`/accounts/${account.id}/pipeline`}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#27272a',
                      color: '#a1a1aa',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <BarChart3 size={12} />
                    Pipeline
                  </a>
                  <a
                    href={`/accounts/${account.id}/performance`}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#27272a',
                      color: '#a1a1aa',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <ExternalLink size={12} />
                    Performance
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
