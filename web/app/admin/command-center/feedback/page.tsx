'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Bug, Lightbulb, Inbox, BarChart } from 'lucide-react';
import type { FeedbackItem, FeedbackStatus, FeedbackType, FeedbackStats } from '@/lib/command-center/feedback-types';
import FeedbackFilterBar from './_components/FeedbackFilterBar';
import FeedbackItemRow from './_components/FeedbackItemRow';
import FeedbackDrawer from './_components/FeedbackDrawer';

export default function FeedbackInboxPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [stats, setStats] = useState<FeedbackStats>({ total: 0, new: 0, bugs: 0, features: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<FeedbackItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<FeedbackType | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);

      const res = await fetch(`/api/admin/command-center/feedback?${params}`);
      if (res.ok) {
        const json = await res.json();
        setItems(json.data || []);
        if (json.stats) setStats(json.stats);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, priorityFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleUpdate(id: string, updates: Record<string, unknown>) {
    const res = await fetch(`/api/admin/command-center/feedback/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const json = await res.json();
      // Update local state
      setItems((prev) => prev.map((item) => (item.id === id ? json.data : item)));
      if (selectedItem?.id === id) setSelectedItem(json.data);
      // Refresh stats
      fetchData();
    }
  }

  const statCards = [
    { label: 'New', value: stats.new, icon: Inbox, color: 'text-blue-400' },
    { label: 'Bugs', value: stats.bugs, icon: Bug, color: 'text-red-400' },
    { label: 'Features', value: stats.features, icon: Lightbulb, color: 'text-amber-400' },
    { label: 'Total', value: stats.total, icon: BarChart, color: 'text-zinc-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/command-center"
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Feedback Inbox</h1>
            <p className="text-sm text-zinc-500 mt-0.5">User feedback tracking & triage</p>
          </div>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">{card.label}</span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <div className="text-2xl font-bold text-white">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <FeedbackFilterBar
        statusFilter={statusFilter}
        typeFilter={typeFilter}
        priorityFilter={priorityFilter}
        onStatusChange={setStatusFilter}
        onTypeChange={setTypeFilter}
        onPriorityChange={setPriorityFilter}
      />

      {/* List */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        {items.map((item) => (
          <FeedbackItemRow
            key={item.id}
            item={item}
            onClick={() => setSelectedItem(item)}
          />
        ))}
        {!loading && items.length === 0 && (
          <div className="py-16 text-center text-zinc-500">No feedback items found</div>
        )}
        {loading && items.length === 0 && (
          <div className="py-16 text-center text-zinc-500">Loading...</div>
        )}
      </div>

      {/* Drawer */}
      {selectedItem && (
        <FeedbackDrawer
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}
