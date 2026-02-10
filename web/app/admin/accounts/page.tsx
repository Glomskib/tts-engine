'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Check, X, TrendingUp, Video, Eye, Heart } from 'lucide-react';
import { PullToRefresh } from '@/components/ui/PullToRefresh';

interface TikTokAccount {
  id: string;
  name: string;
  handle: string;
  type: 'affiliate' | 'pod';
  category_focus: string | null;
  total_videos: number;
  total_views: number;
  total_likes: number;
  avg_engagement: number;
  posting_frequency: string;
  last_posted_at: string | null;
  status: 'active' | 'paused' | 'flagged' | 'banned';
  status_reason: string | null;
  notes: string | null;
  created_at: string;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<TikTokAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    handle: '',
    type: 'affiliate' as 'affiliate' | 'pod',
    category_focus: '',
    posting_frequency: 'daily',
    notes: '',
  });

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      if (data.ok) {
        setAccounts(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleCreate = async () => {
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.ok) {
        setAccounts([...accounts, data.data]);
        setShowNewForm(false);
        resetForm();
      }
    } catch (error) {
      console.error('Failed to create account:', error);
    }
  };

  const handleUpdate = async (id: string, updates: Partial<TikTokAccount>) => {
    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.ok) {
        setAccounts(accounts.map(a => a.id === id ? data.data : a));
      }
    } catch (error) {
      console.error('Failed to update account:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this account? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAccounts(accounts.filter(a => a.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete account:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      handle: '',
      type: 'affiliate',
      category_focus: '',
      posting_frequency: 'daily',
      notes: '',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'paused': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'flagged': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'banned': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
    }
  };

  const getTypeColor = (type: string) => {
    return type === 'affiliate'
      ? 'bg-violet-500/20 text-violet-400 border-violet-500/30'
      : 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  };

  const handleRefresh = async () => {
    await fetchAccounts();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-zinc-400">Loading accounts...</div>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh} className="pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">TikTok Accounts</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage your {accounts.length} TikTok accounts
          </p>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors btn-press min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          Add Account
        </button>
      </div>

      {/* New Account Form */}
      {showNewForm && (
        <div className="mb-6 p-4 sm:p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-4">New Account</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white min-h-[44px]"
                placeholder="Main Wellness"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Handle</label>
              <input
                type="text"
                value={formData.handle}
                onChange={e => setFormData({...formData, handle: e.target.value})}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white min-h-[44px]"
                placeholder="@wellnessvibes_"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Type</label>
              <select
                value={formData.type}
                onChange={e => setFormData({...formData, type: e.target.value as any})}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white min-h-[44px]"
              >
                <option value="affiliate">Affiliate</option>
                <option value="pod">Print on Demand</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Category Focus</label>
              <input
                type="text"
                value={formData.category_focus}
                onChange={e => setFormData({...formData, category_focus: e.target.value})}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white min-h-[44px]"
                placeholder="Health & Wellness"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleCreate}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg btn-press min-h-[44px]"
            >
              Create
            </button>
            <button
              onClick={() => { setShowNewForm(false); resetForm(); }}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg btn-press min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Accounts Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map(account => (
          <div
            key={account.id}
            className="p-4 sm:p-5 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors card-press"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-white truncate">{account.name}</h3>
                <p className="text-sm text-zinc-400">{account.handle}</p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleUpdate(account.id, {
                    status: account.status === 'active' ? 'paused' : 'active'
                  })}
                  className="p-2.5 hover:bg-zinc-800 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
                  title={`${account.status === 'active' ? 'Pause' : 'Activate'}`}
                >
                  {account.status === 'active' ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <X className="w-4 h-4 text-zinc-500" />
                  )}
                </button>
                <button
                  onClick={() => handleDelete(account.id)}
                  className="p-2.5 hover:bg-zinc-800 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>

            {/* Badges */}
            <div className="flex gap-2 mb-4">
              <span className={`px-2 py-1 text-xs rounded border ${getTypeColor(account.type)}`}>
                {account.type === 'affiliate' ? 'Affiliate' : 'POD'}
              </span>
              <span className={`px-2 py-1 text-xs rounded border ${getStatusColor(account.status)}`}>
                {account.status}
              </span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                <div>
                  <div className="text-lg font-semibold text-white">{account.total_videos}</div>
                  <div className="text-xs text-zinc-500">Videos</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                <div>
                  <div className="text-lg font-semibold text-white">
                    {(account.total_views / 1000).toFixed(1)}K
                  </div>
                  <div className="text-xs text-zinc-500">Views</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                <div>
                  <div className="text-lg font-semibold text-white">
                    {(account.total_likes / 1000).toFixed(1)}K
                  </div>
                  <div className="text-xs text-zinc-500">Likes</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                <div>
                  <div className="text-lg font-semibold text-white">
                    {account.avg_engagement.toFixed(1)}%
                  </div>
                  <div className="text-xs text-zinc-500">Engagement</div>
                </div>
              </div>
            </div>

            {/* Category */}
            {account.category_focus && (
              <div className="text-xs text-zinc-500 mt-2 pt-2 border-t border-zinc-800">
                Focus: {account.category_focus}
              </div>
            )}
          </div>
        ))}
      </div>

      {accounts.length === 0 && !showNewForm && (
        <div className="text-center py-12">
          <div className="text-zinc-500 mb-4">No accounts yet</div>
          <button
            onClick={() => setShowNewForm(true)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg btn-press min-h-[44px]"
          >
            Add Your First Account
          </button>
        </div>
      )}
    </PullToRefresh>
  );
}
