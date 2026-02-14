'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Trash2, RefreshCw, Users, Package } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

interface TestAccount {
  id: string;
  email: string;
  plan_id: string;
  plan_status: string;
  credits_remaining: number;
  created_at: string;
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  creator_lite: 'Creator Lite',
  creator_pro: 'Creator Pro',
  brand: 'Brand',
  agency: 'Agency',
};

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-zinc-700 text-zinc-300',
  creator_lite: 'bg-blue-500/20 text-blue-400',
  creator_pro: 'bg-purple-500/20 text-purple-400',
  brand: 'bg-amber-500/20 text-amber-400',
  agency: 'bg-emerald-500/20 text-emerald-400',
};

export default function TestAccountsPage() {
  const [accounts, setAccounts] = useState<TestAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPlan, setNewPlan] = useState('free');
  const [newCredits, setNewCredits] = useState('5');
  const { addToast } = useToast();

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/test-accounts');
      const data = await res.json();
      if (data.ok) {
        setAccounts(data.accounts);
      }
    } catch {
      addToast('Failed to load test accounts', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  async function handleCreatePreset() {
    setActionLoading('preset');
    try {
      const res = await fetch('/api/admin/test-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_preset' }),
      });
      const data = await res.json();
      if (data.ok) {
        const created = data.results.filter((r: { status: string }) => r.status === 'created').length;
        const existing = data.results.filter((r: { status: string }) => r.status === 'already_exists').length;
        addToast(`Created ${created} accounts (${existing} already existed)`, 'success');
        fetchAccounts();
      } else {
        addToast(data.error || 'Failed to create presets', 'error');
      }
    } catch {
      addToast('Failed to create preset accounts', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCreate() {
    if (!newEmail) return;
    setActionLoading('create');
    try {
      const res = await fetch('/api/admin/test-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          email: newEmail,
          plan_id: newPlan,
          credits: parseInt(newCredits) || 5,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        addToast(`Created ${newEmail}`, 'success');
        setShowCreateForm(false);
        setNewEmail('');
        setNewPlan('free');
        setNewCredits('5');
        fetchAccounts();
      } else {
        addToast(data.error || 'Failed to create account', 'error');
      }
    } catch {
      addToast('Failed to create account', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(userId: string, email: string) {
    if (!confirm(`Delete test account ${email}? This cannot be undone.`)) return;
    setActionLoading(userId);
    try {
      const res = await fetch('/api/admin/test-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', userId }),
      });
      const data = await res.json();
      if (data.ok) {
        addToast(`Deleted ${email}`, 'success');
        fetchAccounts();
      } else {
        addToast(data.error || 'Failed to delete', 'error');
      }
    } catch {
      addToast('Failed to delete account', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResetCredits(userId: string) {
    setActionLoading(`reset-${userId}`);
    try {
      const res = await fetch('/api/admin/test-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_credits', userId }),
      });
      const data = await res.json();
      if (data.ok) {
        addToast(`Credits reset to ${data.credits_remaining}`, 'success');
        fetchAccounts();
      } else {
        addToast(data.error || 'Failed to reset credits', 'error');
      }
    } catch {
      addToast('Failed to reset credits', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-purple-400" />
            Test Accounts
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage test accounts for QA and plan testing
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-3 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm hover:bg-zinc-700 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Custom
          </button>
          <button
            onClick={handleCreatePreset}
            disabled={actionLoading === 'preset'}
            className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-500 disabled:opacity-50 flex items-center gap-1.5"
          >
            {actionLoading === 'preset' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
            Create Quick Set
          </button>
        </div>
      </div>

      {/* Create Custom Form */}
      {showCreateForm && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-medium text-zinc-300">Create Custom Test Account</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="test-custom@flashflowai.com"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Plan</label>
              <select
                value={newPlan}
                onChange={(e) => setNewPlan(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
              >
                {Object.entries(PLAN_LABELS).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Credits</label>
              <input
                type="number"
                value={newCredits}
                onChange={(e) => setNewCredits(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowCreateForm(false)}
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-300"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newEmail || actionLoading === 'create'}
              className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-500 disabled:opacity-50 flex items-center gap-1.5"
            >
              {actionLoading === 'create' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            Password for all test accounts: <code className="text-zinc-400">FlashFlow2026!</code>
          </p>
        </div>
      )}

      {/* Accounts Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-xl">
          <Users className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400">No test accounts yet</p>
          <p className="text-xs text-zinc-500 mt-1">Click &quot;Create Quick Set&quot; to create all 5 preset accounts</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Email</th>
                <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Plan</th>
                <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Credits</th>
                <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Created</th>
                <th className="text-right text-xs text-zinc-500 font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3">
                    <span className="text-sm text-white font-mono">{account.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${PLAN_COLORS[account.plan_id] || 'bg-zinc-700 text-zinc-300'}`}>
                      {PLAN_LABELS[account.plan_id] || account.plan_id}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-zinc-300">{account.credits_remaining}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-zinc-500">
                      {new Date(account.created_at).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => handleResetCredits(account.id)}
                        disabled={actionLoading === `reset-${account.id}`}
                        className="p-1.5 text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg"
                        title="Reset Credits"
                      >
                        {actionLoading === `reset-${account.id}` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(account.id, account.email)}
                        disabled={actionLoading === account.id}
                        className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                        title="Delete Account"
                      >
                        {actionLoading === account.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
