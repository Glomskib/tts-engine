'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  Users,
  Shield,
  AlertTriangle,
  RefreshCw,
  Trash2,
  KeyRound,
  CheckCircle,
  Copy,
  ChevronDown,
  Package,
  Plus,
  FlaskConical,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserRecord {
  id: string;
  email: string | null;
  plan_id: string;
  plan_status: string;
  credits_remaining: number;
  lifetime_credits_used: number;
  role: string;
  email_confirmed: boolean;
  last_sign_in: string | null;
  created_at: string;
  is_test: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  creator_lite: 'Creator Lite',
  creator_pro: 'Creator Pro',
  brand: 'Brand',
  agency: 'Agency',
};

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-zinc-700 text-zinc-300',
  creator_lite: 'bg-teal-500/20 text-teal-400',
  creator_pro: 'bg-purple-500/20 text-teal-400',
  brand: 'bg-amber-500/20 text-amber-400',
  agency: 'bg-emerald-500/20 text-emerald-400',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  creator: 'Creator',
  editor: 'Editor',
  va: 'VA',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-500/20 text-red-400',
  creator: 'bg-teal-500/20 text-teal-400',
  editor: 'bg-amber-500/20 text-amber-400',
  va: 'bg-teal-500/20 text-teal-400',
};

const TABS = ['All Users', 'Test Accounts'] as const;
type Tab = (typeof TABS)[number];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('All Users');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const { showSuccess, showError, showInfo } = useToast();

  // Test accounts create form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPlan, setNewPlan] = useState('free');
  const [newCredits, setNewCredits] = useState('5');

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users/manage');
      const data = await res.json();
      if (data.ok) {
        setUsers(data.users);
      } else {
        showError(data.error || 'Failed to load users');
      }
    } catch {
      showError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Filtered lists
  const realUsers = users.filter((u) => !u.is_test);
  const testUsers = users.filter((u) => u.is_test);
  const displayUsers = activeTab === 'All Users' ? realUsers : testUsers;
  const unconfirmedCount = realUsers.filter((u) => !u.email_confirmed).length;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function doAction(actionName: string, userId: string, body: Record<string, unknown> = {}) {
    setActionLoading(`${actionName}-${userId}`);
    try {
      const res = await fetch('/api/admin/users/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionName, userId, ...body }),
      });
      const data = await res.json();
      if (!data.ok) {
        showError(data.error || `Failed: ${actionName}`);
        return null;
      }
      return data;
    } catch {
      showError(`Network error: ${actionName}`);
      return null;
    } finally {
      setActionLoading(null);
    }
  }

  async function handleChangePlan(userId: string, planId: string) {
    const data = await doAction('change_plan', userId, { plan_id: planId });
    if (data) {
      showSuccess(`Plan changed to ${PLAN_LABELS[planId] || planId}`);
      fetchUsers();
    }
  }

  async function handleResetCredits(userId: string) {
    const data = await doAction('reset_credits', userId);
    if (data) {
      showSuccess(`Credits reset to ${data.credits_remaining}`);
      fetchUsers();
    }
  }

  async function handleChangeRole(userId: string, role: string) {
    const data = await doAction('change_role', userId, { role });
    if (data) {
      showSuccess(`Role changed to ${ROLE_LABELS[role] || role}`);
      fetchUsers();
    }
  }

  async function handleConfirmEmail(userId: string) {
    const data = await doAction('confirm_email', userId);
    if (data) {
      showSuccess('Email confirmed');
      fetchUsers();
    }
  }

  async function handleResetPassword(userId: string) {
    const data = await doAction('reset_password', userId);
    if (data) {
      if (data.reset_link) {
        setResetLink(data.reset_link);
        showInfo(`Password reset link generated for ${data.email}`);
      } else {
        showSuccess('Password reset initiated');
      }
    }
  }

  async function handleDeleteUser(userId: string, email: string | null) {
    if (!confirm(`Delete user ${email || userId}? This cannot be undone. All their data will be permanently deleted.`)) return;
    const data = await doAction('delete_user', userId);
    if (data) {
      showSuccess(`Deleted ${email || userId}`);
      setExpandedUser(null);
      fetchUsers();
    }
  }

  // Test account presets
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
        showSuccess(`Created ${created} accounts (${existing} already existed)`);
        fetchUsers();
      } else {
        showError(data.error || 'Failed to create presets');
      }
    } catch {
      showError('Failed to create preset accounts');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCreateCustom() {
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
        showSuccess(`Created ${newEmail}`);
        setShowCreateForm(false);
        setNewEmail('');
        setNewPlan('free');
        setNewCredits('5');
        fetchUsers();
      } else {
        showError(data.error || 'Failed to create account');
      }
    } catch {
      showError('Failed to create account');
    } finally {
      setActionLoading(null);
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatRelative(dateStr: string | null) {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays}d ago`;
    return formatDate(dateStr);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-teal-400" />
            User Management
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            {users.length} total users ({realUsers.length} real, {testUsers.length} test)
            {unconfirmedCount > 0 && (
              <span className="text-amber-400 ml-2">
                {unconfirmedCount} unconfirmed
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchUsers(); }}
          className="px-3 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm hover:bg-zinc-700 flex items-center gap-1.5"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 p-1 rounded-lg w-fit">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            {tab}
            {tab === 'Test Accounts' && testUsers.length > 0 && (
              <span className="ml-1.5 text-xs text-zinc-500">({testUsers.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Test Accounts tab actions */}
      {activeTab === 'Test Accounts' && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleCreatePreset}
            disabled={actionLoading === 'preset'}
            className="px-3 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-purple-500 disabled:opacity-50 flex items-center gap-1.5"
          >
            {actionLoading === 'preset' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
            Create Quick Set (5 plans)
          </button>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-3 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm hover:bg-zinc-700 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Custom Account
          </button>
        </div>
      )}

      {/* Custom create form */}
      {activeTab === 'Test Accounts' && showCreateForm && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-medium text-zinc-300">Create Custom Test Account</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <button onClick={() => setShowCreateForm(false)} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-300">
              Cancel
            </button>
            <button
              onClick={handleCreateCustom}
              disabled={!newEmail || actionLoading === 'create'}
              className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm hover:bg-purple-500 disabled:opacity-50 flex items-center gap-1.5"
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

      {/* Reset link modal */}
      {resetLink && (
        <div className="bg-zinc-900 border border-teal-500/30 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-medium text-teal-400">Password Reset Link Generated</h3>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-zinc-300 bg-zinc-800 px-3 py-2 rounded-lg overflow-x-auto break-all">
              {resetLink}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(resetLink);
                showSuccess('Link copied');
              }}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg shrink-0"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <button onClick={() => setResetLink(null)} className="text-xs text-zinc-500 hover:text-zinc-400">
            Dismiss
          </button>
        </div>
      )}

      {/* Users Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
        </div>
      ) : displayUsers.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900 border border-zinc-800 rounded-xl">
          {activeTab === 'Test Accounts' ? (
            <>
              <FlaskConical className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400">No test accounts yet</p>
              <p className="text-xs text-zinc-500 mt-1">Click &quot;Create Quick Set&quot; to create all 5 preset accounts</p>
            </>
          ) : (
            <>
              <Users className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400">No users found</p>
            </>
          )}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Email</th>
                  <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Plan</th>
                  <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Credits</th>
                  <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Role</th>
                  <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Status</th>
                  <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Last Login</th>
                  <th className="text-right text-xs text-zinc-500 font-medium px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayUsers.map((user) => {
                  const isExpanded = expandedUser === user.id;
                  const isLoading = (key: string) => actionLoading === `${key}-${user.id}`;

                  return (
                    <tr key={user.id} className="border-b border-zinc-800/50 group">
                      {/* Email */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white font-mono truncate max-w-[200px]" title={user.email || user.id}>
                            {user.email || user.id.slice(0, 8) + '...'}
                          </span>
                          {!user.email_confirmed && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-400 shrink-0"
                              title="Email not confirmed"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              UNCONFIRMED
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Plan */}
                      <td className="px-4 py-3">
                        <select
                          value={user.plan_id}
                          onChange={(e) => handleChangePlan(user.id, e.target.value)}
                          disabled={!!actionLoading}
                          className={`text-xs px-2 py-1 rounded-full border-0 cursor-pointer ${PLAN_COLORS[user.plan_id] || 'bg-zinc-700 text-zinc-300'}`}
                        >
                          {Object.entries(PLAN_LABELS).map(([id, name]) => (
                            <option key={id} value={id}>{name}</option>
                          ))}
                        </select>
                      </td>

                      {/* Credits */}
                      <td className="px-4 py-3">
                        <span className="text-sm text-zinc-300">{user.credits_remaining}</span>
                        {user.lifetime_credits_used > 0 && (
                          <span className="text-xs text-zinc-600 ml-1">({user.lifetime_credits_used} used)</span>
                        )}
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">
                        <select
                          value={user.role}
                          onChange={(e) => handleChangeRole(user.id, e.target.value)}
                          disabled={!!actionLoading}
                          className={`text-xs px-2 py-1 rounded-full border-0 cursor-pointer ${ROLE_COLORS[user.role] || 'bg-zinc-700 text-zinc-300'}`}
                        >
                          {Object.entries(ROLE_LABELS).map(([id, name]) => (
                            <option key={id} value={id}>{name}</option>
                          ))}
                        </select>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {user.email_confirmed ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-400">
                            <CheckCircle className="w-3 h-3" />
                            Active
                          </span>
                        ) : (
                          <button
                            onClick={() => handleConfirmEmail(user.id)}
                            disabled={isLoading('confirm_email')}
                            className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2"
                          >
                            {isLoading('confirm_email') ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
                            Confirm
                          </button>
                        )}
                      </td>

                      {/* Last Login */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-zinc-500">{formatRelative(user.last_sign_in)}</span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => handleResetCredits(user.id)}
                            disabled={isLoading('reset_credits')}
                            className="p-1.5 text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg"
                            title="Reset Credits"
                          >
                            {isLoading('reset_credits') ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => handleResetPassword(user.id)}
                            disabled={isLoading('reset_password')}
                            className="p-1.5 text-zinc-500 hover:text-teal-400 hover:bg-teal-500/10 rounded-lg"
                            title="Reset Password"
                          >
                            {isLoading('reset_password') ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => setExpandedUser(isExpanded ? null : user.id)}
                            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 rounded-lg"
                            title="More actions"
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>

                        {/* Expanded actions */}
                        {isExpanded && (
                          <div className="mt-2 flex flex-col gap-1 items-end">
                            <button
                              onClick={() => handleDeleteUser(user.id, user.email)}
                              disabled={isLoading('delete_user')}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded-lg"
                            >
                              {isLoading('delete_user') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              Delete User
                            </button>
                            <span className="text-[10px] text-zinc-600 font-mono">{user.id}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
