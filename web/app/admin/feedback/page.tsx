'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bug, Lightbulb, Sparkles, MessageSquare, ChevronDown, ChevronUp, ExternalLink, Image as ImageIcon, Loader2 } from 'lucide-react';
import AdminPageLayout, { AdminCard, StatCard } from '@/app/admin/components/AdminPageLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Bug; emoji: string; color: string }> = {
  bug: { label: 'Bug', icon: Bug, emoji: '\u{1F41B}', color: 'text-red-400' },
  feature: { label: 'Feature', icon: Lightbulb, emoji: '\u{1F4A1}', color: 'text-amber-400' },
  improvement: { label: 'Improvement', icon: Sparkles, emoji: '\u2728', color: 'text-teal-400' },
  other: { label: 'Other', icon: MessageSquare, emoji: '\u{1F4AC}', color: 'text-zinc-400' },
};

const STATUS_OPTIONS = [
  { value: 'new', label: 'New', color: 'bg-zinc-600' },
  { value: 'reviewed', label: 'Reviewed', color: 'bg-amber-500' },
  { value: 'planned', label: 'Planned', color: 'bg-teal-500' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-purple-500' },
  { value: 'done', label: 'Done', color: 'bg-emerald-500' },
  { value: 'wont_fix', label: "Won't Fix", color: 'bg-zinc-500' },
];

interface FeedbackItem {
  id: string;
  user_id: string | null;
  email: string | null;
  type: string;
  title: string;
  description: string;
  page_url: string | null;
  screenshot_url: string | null;
  priority: string;
  status: string;
  admin_notes: string | null;
  plan_id: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

interface Stats {
  total: number;
  new: number;
  bugs: number;
  features: number;
  improvements: number;
  topPages: { page: string; count: number }[];
}

export default function FeedbackPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { showSuccess, showError } = useToast();

  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ admin: 'true' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);

      const res = await fetch(`/api/feedback?${params}`);
      if (res.ok) {
        const json = await res.json();
        setFeedback(json.data || []);
        if (json.stats) setStats(json.stats);
      }
    } catch {
      showError('Failed to load feedback');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, showError]);

  useEffect(() => {
    if (isAdmin) fetchFeedback();
  }, [isAdmin, fetchFeedback]);

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id, status: newStatus }),
      });
      if (res.ok) {
        setFeedback((prev) =>
          prev.map((f) => (f.id === id ? { ...f, status: newStatus } : f))
        );
        showSuccess(`Status updated to ${newStatus}`);
      }
    } catch {
      showError('Failed to update status');
    }
  };

  const saveNotes = async (id: string) => {
    const notes = editingNotes[id];
    if (notes === undefined) return;

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id, admin_notes: notes }),
      });
      if (res.ok) {
        setFeedback((prev) =>
          prev.map((f) => (f.id === id ? { ...f, admin_notes: notes } : f))
        );
        setEditingNotes((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        showSuccess('Notes saved');
      }
    } catch {
      showError('Failed to save notes');
    }
  };

  if (authLoading) {
    return (
      <AdminPageLayout title="Feedback">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        </div>
      </AdminPageLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AdminPageLayout title="Feedback">
        <p className="text-zinc-500">Admin access required.</p>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="User Feedback"
      subtitle="Bug reports, feature requests, and improvement suggestions from users"
    >
      {/* Quick Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Unreviewed"
            value={stats.new}
            variant={stats.new > 0 ? 'danger' : 'default'}
          />
          <StatCard label="Bugs" value={stats.bugs} variant="warning" />
          <StatCard label="Features" value={stats.features} variant="default" />
          <StatCard label="Improvements" value={stats.improvements} variant="success" />
        </div>
      )}

      {/* Top Pages */}
      {stats?.topPages && stats.topPages.length > 0 && (
        <AdminCard title="Most Reported Pages">
          <div className="space-y-2">
            {stats.topPages.map((p) => (
              <div key={p.page} className="flex items-center justify-between text-sm">
                <span className="text-zinc-300 font-mono text-xs truncate">{p.page}</span>
                <span className="text-zinc-500 ml-2 flex-shrink-0">{p.count} reports</span>
              </div>
            ))}
          </div>
        </AdminCard>
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
            <label className="text-xs font-medium text-zinc-500 uppercase">Type:</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-violet-500"
            >
              <option value="all">All</option>
              <option value="bug">Bug</option>
              <option value="feature">Feature</option>
              <option value="improvement">Improvement</option>
              <option value="other">Other</option>
            </select>
          </div>
          <span className="text-sm text-zinc-500 ml-auto">
            {feedback.length} result{feedback.length !== 1 ? 's' : ''}
          </span>
        </div>
      </AdminCard>

      {/* Feedback Table */}
      <AdminCard noPadding>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : feedback.length === 0 ? (
          <div className="py-16 text-center text-zinc-500">No feedback found.</div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {feedback.map((item) => {
              const typeInfo = TYPE_CONFIG[item.type] || TYPE_CONFIG.other;
              const statusInfo = STATUS_OPTIONS.find((s) => s.value === item.status) || STATUS_OPTIONS[0];
              const isExpanded = expandedId === item.id;
              const page = item.page_url?.replace(/https?:\/\/[^/]+/, '') || '';

              return (
                <div key={item.id}>
                  {/* Row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-zinc-900/50 transition-colors"
                  >
                    <span className={`flex-shrink-0 ${typeInfo.color}`}>
                      <typeInfo.icon className="w-4 h-4" />
                    </span>
                    <span className="text-sm font-medium text-zinc-200 truncate flex-1">
                      {item.title}
                    </span>
                    <span className="text-xs text-zinc-500 truncate max-w-[120px] hidden sm:block">
                      {item.email || 'anonymous'}
                    </span>
                    <span className="text-xs text-zinc-600 hidden md:block">
                      {item.plan_id || 'free'}
                    </span>
                    <span className="text-xs text-zinc-600 hidden lg:block font-mono truncate max-w-[120px]">
                      {page}
                    </span>
                    <span className={`px-2 py-0.5 text-[10px] font-medium text-white rounded-full flex-shrink-0 ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                    <span className="text-xs text-zinc-600 flex-shrink-0">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                    )}
                  </button>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-1 bg-zinc-900/30 space-y-4">
                      {/* Description */}
                      <div>
                        <h4 className="text-xs font-medium text-zinc-500 uppercase mb-1">Description</h4>
                        <p className="text-sm text-zinc-300 whitespace-pre-wrap">{item.description}</p>
                      </div>

                      {/* Screenshot */}
                      {item.screenshot_url && (
                        <div>
                          <h4 className="text-xs font-medium text-zinc-500 uppercase mb-1">Screenshot</h4>
                          <a
                            href={item.screenshot_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-300 hover:text-white transition-colors"
                          >
                            <ImageIcon className="w-4 h-4" />
                            View Screenshot
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}

                      {/* Meta info */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-zinc-500 block">User</span>
                          <span className="text-zinc-300">{item.email || 'anonymous'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Plan</span>
                          <span className="text-zinc-300">{item.plan_id || 'free'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Page</span>
                          <span className="text-zinc-300 font-mono">{page || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Device</span>
                          <span className="text-zinc-300">
                            {item.user_agent
                              ? /mobile|android|iphone/i.test(item.user_agent)
                                ? 'Mobile'
                                : 'Desktop'
                              : 'Unknown'}
                          </span>
                        </div>
                      </div>

                      {/* Status Update */}
                      <div>
                        <h4 className="text-xs font-medium text-zinc-500 uppercase mb-2">Update Status</h4>
                        <div className="flex flex-wrap gap-2">
                          {STATUS_OPTIONS.map((s) => (
                            <button
                              key={s.value}
                              onClick={() => updateStatus(item.id, s.value)}
                              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                item.status === s.value
                                  ? `${s.color} text-white border-transparent`
                                  : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600 hover:text-zinc-200'
                              }`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Admin Notes */}
                      <div>
                        <h4 className="text-xs font-medium text-zinc-500 uppercase mb-1.5">Admin Notes</h4>
                        <textarea
                          value={editingNotes[item.id] ?? item.admin_notes ?? ''}
                          onChange={(e) =>
                            setEditingNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          placeholder="Add internal notes..."
                          rows={2}
                          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
                        />
                        {editingNotes[item.id] !== undefined &&
                          editingNotes[item.id] !== (item.admin_notes ?? '') && (
                            <button
                              onClick={() => saveNotes(item.id)}
                              className="mt-2 px-3 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
                            >
                              Save Notes
                            </button>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </AdminCard>
    </AdminPageLayout>
  );
}
