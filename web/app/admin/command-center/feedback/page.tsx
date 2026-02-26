'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bug, Lightbulb, Inbox, BarChart } from 'lucide-react';
import CommandCenterShell from '../_components/CommandCenterShell';
import { CCPageHeader, CCStatCard } from '../_components/ui';
import CCEmptyState from '../_components/ui/CCEmptyState';
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
      setItems((prev) => prev.map((item) => (item.id === id ? json.data : item)));
      if (selectedItem?.id === id) setSelectedItem(json.data);
      fetchData();
    }
  }

  return (
    <CommandCenterShell>
      <CCPageHeader
        title="Feedback"
        subtitle="User feedback, bugs, and feature requests"
        loading={loading}
        onRefresh={fetchData}
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <CCStatCard label="New" value={stats.new} icon={Inbox} color="text-blue-400" />
        <CCStatCard label="Bugs" value={stats.bugs} icon={Bug} color="text-red-400" />
        <CCStatCard label="Features" value={stats.features} icon={Lightbulb} color="text-amber-400" />
        <CCStatCard label="Total" value={stats.total} icon={BarChart} color="text-zinc-400" />
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
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        {items.map((item) => (
          <FeedbackItemRow
            key={item.id}
            item={item}
            onClick={() => setSelectedItem(item)}
          />
        ))}
        {!loading && items.length === 0 && (
          <CCEmptyState
            icon={Inbox}
            title="No feedback items found"
            body="Adjust your filters or wait for new submissions."
          />
        )}
        {loading && items.length === 0 && (
          <div className="py-16 text-center text-zinc-500 text-sm">Loading...</div>
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
    </CommandCenterShell>
  );
}
