'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Send, Clock, User, AlertTriangle, Calendar, FolderOpen } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { getStatusConfig, PRIORITY_LABELS, PRIORITY_COLORS, RISK_BADGE, STATUS_COLUMNS } from './constants';
import type { TaskWithProject } from './constants';

interface TaskEvent {
  id: string;
  ts: string;
  agent_id: string;
  event_type: string;
  payload: Record<string, unknown>;
}

interface Props {
  task: TaskWithProject;
  onClose: () => void;
  onUpdate: (taskId: string, updates: Record<string, unknown>) => Promise<void>;
}

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

export default function TaskDrawer({ task, onClose, onUpdate }: Props) {
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const titleRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const fetchEvents = useCallback(async () => {
    const res = await fetch(`/api/admin/cc-projects/event?task_id=${task.id}`);
    if (res.ok) {
      const json = await res.json();
      setEvents(json.data || []);
    }
  }, [task.id]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    setTitleDraft(task.title);
  }, [task.title]);

  useEffect(() => {
    if (editingTitle && titleRef.current) {
      titleRef.current.focus();
      titleRef.current.select();
    }
  }, [editingTitle]);

  async function handleTitleSave() {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== task.title) {
      await onUpdate(task.id, { title: trimmed });
    } else {
      setTitleDraft(task.title);
    }
  }

  async function handleStatusChange(status: string) {
    await onUpdate(task.id, { status });
    fetchEvents();
  }

  async function handleAddComment() {
    if (!comment.trim() || submitting) return;
    setSubmitting(true);
    try {
      await fetch('/api/admin/cc-projects/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: task.id,
          agent_id: 'admin',
          event_type: 'comment',
          payload: { text: comment.trim() },
        }),
      });
      setComment('');
      fetchEvents();
    } finally {
      setSubmitting(false);
    }
  }

  const riskInfo = RISK_BADGE[task.risk_tier as keyof typeof RISK_BADGE];

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="fixed inset-0 bg-black/40 z-40"
        onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full sm:max-w-[480px] bg-zinc-900 border-l border-zinc-700 z-50 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-zinc-800">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                ref={titleRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTitleSave();
                  if (e.key === 'Escape') { setTitleDraft(task.title); setEditingTitle(false); }
                }}
                className="w-full text-lg font-semibold text-white bg-zinc-800 border border-zinc-600 rounded px-2 py-1"
              />
            ) : (
              <h2
                className="text-lg font-semibold text-white truncate cursor-pointer hover:text-zinc-300"
                onClick={() => setEditingTitle(true)}
                title="Click to edit"
              >
                {task.title}
              </h2>
            )}
            <div className="flex items-center gap-2 mt-2">
              <StatusBadge status={task.status} />
              <span className={`text-xs font-medium ${PRIORITY_COLORS[task.priority] || 'text-zinc-400'}`}>
                {PRIORITY_LABELS[task.priority] || `P${task.priority}`}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Details section */}
          <div className="p-5 space-y-4 border-b border-zinc-800">
            {/* Status selector */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500 w-20 shrink-0">Status</span>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_COLUMNS.map((col) => (
                  <button
                    key={col.dbValue}
                    onClick={() => handleStatusChange(col.dbValue)}
                    className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                      task.status === col.dbValue
                        ? `${col.bgClass} ${col.textClass} ring-1 ring-current`
                        : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {col.label}
                  </button>
                ))}
              </div>
            </div>

            {task.description && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-zinc-500 w-20 shrink-0 pt-0.5">Description</span>
                <p className="text-sm text-zinc-300 whitespace-pre-wrap">{task.description}</p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <User className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-xs text-zinc-500 w-16 shrink-0">Assignee</span>
              <span className="text-sm text-zinc-300 font-mono">{task.assigned_agent}</span>
            </div>

            {task.due_at && (
              <div className="flex items-center gap-3">
                <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs text-zinc-500 w-16 shrink-0">Due</span>
                <span className="text-sm text-zinc-300">{new Date(task.due_at).toLocaleDateString()}</span>
              </div>
            )}

            {task.cc_projects?.name && (
              <div className="flex items-center gap-3">
                <FolderOpen className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs text-zinc-500 w-16 shrink-0">Project</span>
                <span className="text-sm text-zinc-300">{task.cc_projects.name}</span>
              </div>
            )}

            {riskInfo && (
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs text-zinc-500 w-16 shrink-0">Risk</span>
                <span className={`text-sm font-medium ${riskInfo.className}`}>{riskInfo.label}</span>
              </div>
            )}
          </div>

          {/* Updates section */}
          <div className="p-5">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Updates</h3>
            <div className="space-y-3">
              {events.map((e) => (
                <div key={e.id} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                    <Clock className="w-3 h-3 text-zinc-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-400">{e.agent_id}</span>
                      <span className="text-xs text-zinc-600">{timeAgo(e.ts)}</span>
                    </div>
                    {e.event_type === 'comment' ? (
                      <p className="text-sm text-zinc-300 mt-0.5">{String(e.payload?.text || '')}</p>
                    ) : e.event_type === 'status_change' ? (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Changed status to <StatusBadge status={String(e.payload?.new_status || '')} size="sm" />
                      </p>
                    ) : (
                      <p className="text-xs text-zinc-500 mt-0.5 uppercase">{e.event_type}</p>
                    )}
                  </div>
                </div>
              ))}
              {events.length === 0 && (
                <p className="text-sm text-zinc-500">No events yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Add comment */}
        <div className="border-t border-zinc-800 p-4">
          <div className="flex gap-2">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
              placeholder="Add a comment..."
              className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-600"
            />
            <button
              onClick={handleAddComment}
              disabled={!comment.trim() || submitting}
              className="px-3 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
