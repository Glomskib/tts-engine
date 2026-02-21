'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, ChevronRight } from 'lucide-react';
import AdminPageLayout, { AdminCard, StatCard } from '@/app/admin/components/AdminPageLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open', color: 'bg-blue-500' },
  { value: 'waiting_on_customer', label: 'Waiting', color: 'bg-amber-500' },
  { value: 'resolved', label: 'Resolved', color: 'bg-emerald-500' },
  { value: 'closed', label: 'Closed', color: 'bg-zinc-500' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

interface SupportThread {
  id: string;
  user_email: string | null;
  subject: string;
  status: string;
  priority: string;
  tags: string[] | null;
  assigned_to: string | null;
  last_message_at: string;
  created_at: string;
}

interface Stats {
  open: number;
  waiting: number;
  resolved_today: number;
  total: number;
}

export default function AdminSupportPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { showError } = useToast();

  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ admin: 'true' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);

      const res = await fetch(`/api/support/threads?${params}`);
      if (res.ok) {
        const json = await res.json();
        setThreads(json.data || []);
        if (json.stats) setStats(json.stats);
      }
    } catch {
      showError('Failed to load support threads');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, showError]);

  useEffect(() => {
    if (isAdmin) fetchThreads();
  }, [isAdmin, fetchThreads]);

  if (authLoading) {
    return (
      <AdminPageLayout title="Support">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        </div>
      </AdminPageLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AdminPageLayout title="Support">
        <p className="text-zinc-500">Admin access required.</p>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="Support Threads"
      subtitle="Customer support conversations and issue tracking"
    >
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Open" value={stats.open} variant={stats.open > 0 ? 'danger' : 'default'} />
          <StatCard label="Waiting on Customer" value={stats.waiting} variant="warning" />
          <StatCard label="Resolved Today" value={stats.resolved_today} variant="success" />
          <StatCard label="Total Threads" value={stats.total} variant="default" />
        </div>
      )}

      {/* Filters */}
      <AdminCard>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-zinc-500 uppercase">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-violet-500"
            >
              <option value="all">All</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-zinc-500 uppercase">Priority:</label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-violet-500"
            >
              <option value="all">All</option>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <span className="text-sm text-zinc-500 ml-auto">
            {threads.length} thread{threads.length !== 1 ? 's' : ''}
          </span>
        </div>
      </AdminCard>

      {/* Thread List */}
      <AdminCard noPadding>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : threads.length === 0 ? (
          <div className="py-16 text-center text-zinc-500">No support threads found.</div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {threads.map((thread) => {
              const statusInfo = STATUS_OPTIONS.find((s) => s.value === thread.status) || STATUS_OPTIONS[0];
              return (
                <Link
                  key={thread.id}
                  href={`/admin/support/${thread.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-zinc-900/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">{thread.subject}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {thread.user_email || 'anonymous'} &middot; {new Date(thread.last_message_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-medium text-white rounded-full flex-shrink-0 ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                  <span className="text-xs text-zinc-600 capitalize flex-shrink-0">
                    {thread.priority}
                  </span>
                  <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </AdminCard>
    </AdminPageLayout>
  );
}
