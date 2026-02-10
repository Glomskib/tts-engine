'use client';

import { useState, useEffect, useCallback } from 'react';
import { FlaskConical, Plus, Trophy, Archive, Clock, ChevronDown, Eye, Heart, Share2, BarChart, DollarSign } from 'lucide-react';

interface ABTest {
  id: string;
  name: string;
  status: 'active' | 'completed' | 'archived';
  hypothesis: string | null;
  winner: 'a' | 'b' | null;
  winner_reason: string | null;
  variant_a_label: string;
  variant_b_label: string;
  variant_a: { id: string; title: string } | null;
  variant_b: { id: string; title: string } | null;
  product: { id: string; name: string; brand: string } | null;
  notes: string | null;
  metrics: {
    variant_a?: { views?: number; likes?: number; shares?: number; engagement_rate?: number; revenue?: number };
    variant_b?: { views?: number; likes?: number; shares?: number; engagement_rate?: number; revenue?: number };
    [key: string]: unknown;
  };
  duration_days?: number;
  created_at: string;
  completed_at: string | null;
}

function formatNum(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function MetricBar({ label, icon: Icon, valA, valB }: { label: string; icon: React.ComponentType<{ className?: string }>; valA: number; valB: number }) {
  const max = Math.max(valA, valB, 1);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-[10px] text-zinc-500"><Icon className="w-3 h-3" />{label}</div>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${(valA / max) * 100}%` }} />
          </div>
          <span className="text-[10px] text-zinc-400">{formatNum(valA)}</span>
        </div>
        <div className="flex-1">
          <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${(valB / max) * 100}%` }} />
          </div>
          <span className="text-[10px] text-zinc-400">{formatNum(valB)}</span>
        </div>
      </div>
    </div>
  );
}

type TabKey = 'active' | 'completed' | 'archived';

export default function ABTestsPage() {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('active');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createHypothesis, setCreateHypothesis] = useState('');
  const [creating, setCreating] = useState(false);

  // Declare winner state
  const [declaringId, setDeclaringId] = useState<string | null>(null);
  const [winnerReason, setWinnerReason] = useState('');

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchTests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ab-tests?status=${activeTab}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTests(data.data || []);
      }
    } catch {
      console.error('Failed to fetch tests');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchTests();
  }, [fetchTests]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/ab-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim(),
          hypothesis: createHypothesis.trim() || undefined,
        }),
      });
      if (res.ok) {
        showToast('Test created');
        setShowCreateModal(false);
        setCreateName('');
        setCreateHypothesis('');
        fetchTests();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.message || 'Failed to create test', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setCreating(false);
    }
  };

  const declareWinner = async (testId: string, winner: 'a' | 'b') => {
    try {
      const res = await fetch(`/api/ab-tests/${testId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winner,
          winner_reason: winnerReason.trim() || undefined,
        }),
      });
      if (res.ok) {
        showToast(`Winner declared!`);
        setDeclaringId(null);
        setWinnerReason('');
        fetchTests();
      } else {
        showToast('Failed to declare winner', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
  };

  const archiveTest = async (testId: string) => {
    try {
      const res = await fetch(`/api/ab-tests/${testId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
      if (res.ok) {
        showToast('Test archived');
        fetchTests();
      }
    } catch {
      showToast('Network error', 'error');
    }
  };

  const tabs: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'active', label: 'Active', icon: Clock },
    { key: 'completed', label: 'Completed', icon: Trophy },
    { key: 'archived', label: 'Archived', icon: Archive },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto pb-24 lg:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-teal-400" />
            A/B Tests
          </h1>
          <p className="text-zinc-400 text-sm">Compare content variations and track winners</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          New Test
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-zinc-800">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-teal-500 text-teal-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 rounded-xl bg-zinc-900 border border-white/5 animate-pulse" />
          ))}
        </div>
      ) : tests.length === 0 ? (
        <div className="text-center py-16">
          <FlaskConical className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-zinc-400 mb-2">
            No {activeTab} tests
          </h3>
          <p className="text-sm text-zinc-600 mb-6">
            {activeTab === 'active'
              ? 'Create a test to compare two content variations side by side.'
              : `No ${activeTab} tests yet.`}
          </p>
          {activeTab === 'active' && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Create Your First Test
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {tests.map(test => (
            <div
              key={test.id}
              className="p-5 rounded-xl border border-white/10 bg-zinc-900/50 hover:border-white/20 transition-colors"
            >
              {/* Test header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-white truncate">{test.name}</h3>
                  {test.product && (
                    <span className="text-xs text-zinc-500">
                      {test.product.brand} — {test.product.name}
                    </span>
                  )}
                </div>
                {test.status === 'completed' && test.winner && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <Trophy className="w-3 h-3" />
                    {test.winner === 'a' ? test.variant_a_label : test.variant_b_label}
                  </span>
                )}
              </div>

              {/* Hypothesis */}
              {test.hypothesis && (
                <p className="text-sm text-zinc-400 mb-3 line-clamp-2">{test.hypothesis}</p>
              )}

              {/* Variants */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className={`p-3 rounded-lg border ${
                  test.winner === 'a'
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-white/5 bg-zinc-800/50'
                }`}>
                  <div className="text-xs text-zinc-500 mb-1">{test.variant_a_label}</div>
                  <div className="text-sm text-zinc-200 truncate">
                    {test.variant_a?.title || 'No script linked'}
                  </div>
                  {test.winner === 'a' && (
                    <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                      <Trophy className="w-3 h-3" /> Winner
                    </div>
                  )}
                </div>
                <div className={`p-3 rounded-lg border ${
                  test.winner === 'b'
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-white/5 bg-zinc-800/50'
                }`}>
                  <div className="text-xs text-zinc-500 mb-1">{test.variant_b_label}</div>
                  <div className="text-sm text-zinc-200 truncate">
                    {test.variant_b?.title || 'No script linked'}
                  </div>
                  {test.winner === 'b' && (
                    <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                      <Trophy className="w-3 h-3" /> Winner
                    </div>
                  )}
                </div>
              </div>

              {/* Performance Comparison */}
              {test.metrics?.variant_a && test.metrics?.variant_b && (
                <div className="mb-3 p-3 bg-zinc-800/30 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart className="w-3 h-3 text-zinc-500" />
                    <span className="text-xs font-medium text-zinc-400">Performance Comparison</span>
                  </div>
                  <div className="flex items-center gap-4 mb-1 text-[10px]">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-500" />{test.variant_a_label}</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500" />{test.variant_b_label}</span>
                  </div>
                  <MetricBar label="Views" icon={Eye} valA={test.metrics.variant_a.views || 0} valB={test.metrics.variant_b.views || 0} />
                  <MetricBar label="Likes" icon={Heart} valA={test.metrics.variant_a.likes || 0} valB={test.metrics.variant_b.likes || 0} />
                  <MetricBar label="Shares" icon={Share2} valA={test.metrics.variant_a.shares || 0} valB={test.metrics.variant_b.shares || 0} />
                  <MetricBar label="Engagement %" icon={BarChart} valA={test.metrics.variant_a.engagement_rate || 0} valB={test.metrics.variant_b.engagement_rate || 0} />
                  {((test.metrics.variant_a.revenue || 0) > 0 || (test.metrics.variant_b.revenue || 0) > 0) && (
                    <MetricBar label="Revenue" icon={DollarSign} valA={test.metrics.variant_a.revenue || 0} valB={test.metrics.variant_b.revenue || 0} />
                  )}
                </div>
              )}

              {/* Winner reason */}
              {test.winner_reason && (
                <p className="text-xs text-zinc-500 mb-3">Reason: {test.winner_reason}</p>
              )}

              {/* Actions */}
              {test.status === 'active' && (
                <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                  {declaringId === test.id ? (
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        placeholder="Why is this the winner? (optional)"
                        value={winnerReason}
                        onChange={(e) => setWinnerReason(e.target.value)}
                        className="w-full px-3 py-1.5 bg-zinc-800 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => declareWinner(test.id, 'a')}
                          className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-md text-xs font-medium transition-colors"
                        >
                          {test.variant_a_label} Wins
                        </button>
                        <button
                          type="button"
                          onClick={() => declareWinner(test.id, 'b')}
                          className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-md text-xs font-medium transition-colors"
                        >
                          {test.variant_b_label} Wins
                        </button>
                        <button
                          type="button"
                          onClick={() => { setDeclaringId(null); setWinnerReason(''); }}
                          className="px-3 py-1.5 text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setDeclaringId(test.id)}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-xs font-medium transition-colors flex items-center gap-1"
                      >
                        <Trophy className="w-3 h-3" />
                        Declare Winner
                      </button>
                      <button
                        type="button"
                        onClick={() => archiveTest(test.id)}
                        className="px-3 py-1.5 text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
                      >
                        Archive
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5">
                <span className="text-xs text-zinc-600">
                  Created {new Date(test.created_at).toLocaleDateString()}
                </span>
                {test.completed_at && (
                  <span className="text-xs text-zinc-600">
                    Completed {new Date(test.completed_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-lg font-semibold text-white">New A/B Test</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Test Name</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g., Hook style comparison for Product X"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Hypothesis (optional)</label>
                <textarea
                  value={createHypothesis}
                  onChange={(e) => setCreateHypothesis(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  placeholder="I think Variant A will perform better because..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!createName.trim() || creating}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Test'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
