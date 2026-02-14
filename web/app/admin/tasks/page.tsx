'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw, Bug, Lightbulb, Search, FileText } from 'lucide-react';
import AdminPageLayout, { AdminCard, AdminButton, StatCard } from '../components/AdminPageLayout';

interface AgentTask {
  id: string;
  type: 'bug_fix' | 'feature' | 'research' | 'content';
  title: string;
  prompt: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'approved' | 'in_progress' | 'done' | 'verified' | 'rejected';
  source: string;
  result: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_STYLES: Record<AgentTask['status'], { bg: string; text: string }> = {
  pending: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  approved: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  in_progress: { bg: 'bg-violet-500/15', text: 'text-violet-400' },
  done: { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  verified: { bg: 'bg-teal-500/15', text: 'text-teal-400' },
  rejected: { bg: 'bg-red-500/15', text: 'text-red-400' },
};

const PRIORITY_STYLES: Record<AgentTask['priority'], { bg: string; text: string }> = {
  critical: { bg: 'bg-red-500/15', text: 'text-red-400' },
  high: { bg: 'bg-orange-500/15', text: 'text-orange-400' },
  medium: { bg: 'bg-zinc-500/15', text: 'text-zinc-400' },
  low: { bg: 'bg-zinc-800/50', text: 'text-zinc-500' },
};

const TYPE_ICONS: Record<AgentTask['type'], typeof Bug> = {
  bug_fix: Bug,
  feature: Lightbulb,
  research: Search,
  content: FileText,
};

const TYPE_LABELS: Record<AgentTask['type'], string> = {
  bug_fix: 'Bug Fix',
  feature: 'Feature',
  research: 'Research',
  content: 'Content',
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AgentTasksPage() {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const url = statusFilter ? `/api/tasks?status=${statusFilter}` : '/api/tasks';
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.message || 'Failed to load tasks');
        return;
      }
      setTasks(json.data || []);
    } catch {
      setError('Failed to fetch tasks');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const updateTask = async (id: string, status: string) => {
    setUpdating(id);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setTasks((prev) => prev.map((t) => (t.id === id ? json.data : t)));
      } else {
        setError(json.message || 'Update failed');
      }
    } catch {
      setError('Failed to update task');
    } finally {
      setUpdating(null);
    }
  };

  const stats = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    approved: tasks.filter((t) => t.status === 'approved').length,
    done: tasks.filter((t) => t.status === 'done' || t.status === 'verified').length,
  };

  return (
    <AdminPageLayout
      title="Agent Tasks"
      subtitle="Bolt → Claude Code task queue"
      headerActions={
        <AdminButton variant="secondary" onClick={fetchTasks} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </AdminButton>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Pending" value={stats.pending} variant="warning" />
        <StatCard label="Approved" value={stats.approved} variant="success" />
        <StatCard label="Completed" value={stats.done} />
      </div>

      {/* Filter */}
      <AdminCard>
        <div className="flex flex-wrap gap-4 items-center">
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-zinc-800 border border-white/10 text-zinc-100 text-sm rounded-lg px-3 py-2 min-w-[140px] focus:ring-2 focus:ring-violet-500 focus:outline-none"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </AdminCard>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <AdminCard noPadding>
        {loading ? (
          <div className="p-8 text-center text-zinc-500">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">
            No tasks found. Tasks created by Bolt will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-xs sm:text-sm min-w-[540px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left font-medium text-zinc-500">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-500">Title</th>
                  <th className="px-4 py-3 text-center font-medium text-zinc-500">Priority</th>
                  <th className="px-4 py-3 text-center font-medium text-zinc-500">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-500">Created</th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const TypeIcon = TYPE_ICONS[task.type];
                  const statusStyle = STATUS_STYLES[task.status];
                  const priorityStyle = PRIORITY_STYLES[task.priority];
                  const isExpanded = expandedId === task.id;

                  return (
                    <tr
                      key={task.id}
                      className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : task.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <TypeIcon className="w-4 h-4 text-zinc-400" />
                          <span className="text-zinc-300 text-xs">{TYPE_LABELS[task.type]}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <span className="text-zinc-100 font-medium">{task.title}</span>
                          {isExpanded && (
                            <div className="mt-2 space-y-2">
                              <pre className="text-xs text-zinc-400 whitespace-pre-wrap bg-zinc-800/50 rounded-lg p-3 max-h-40 overflow-y-auto">
                                {task.prompt}
                              </pre>
                              {task.result && (
                                <div className="text-xs text-zinc-400">
                                  <span className="text-zinc-500 font-medium">Result: </span>
                                  <span>{task.result}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-md text-xs font-medium ${priorityStyle.bg} ${priorityStyle.text}`}>
                          {task.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-md text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                          {task.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                        {timeAgo(task.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {task.status === 'pending' && (
                            <>
                              <button
                                onClick={() => updateTask(task.id, 'approved')}
                                disabled={updating === task.id}
                                className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-50"
                                title="Approve"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => updateTask(task.id, 'rejected')}
                                disabled={updating === task.id}
                                className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                                title="Reject"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {task.status === 'done' && (
                            <button
                              onClick={() => updateTask(task.id, 'verified')}
                              disabled={updating === task.id}
                              className="p-1.5 text-teal-400 hover:bg-teal-500/10 rounded-lg transition-colors disabled:opacity-50"
                              title="Verify"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                          {(task.status === 'approved' || task.status === 'in_progress') && (
                            <span className="text-xs text-zinc-500">
                              <Clock className="w-4 h-4 inline" />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </AdminPageLayout>
  );
}
