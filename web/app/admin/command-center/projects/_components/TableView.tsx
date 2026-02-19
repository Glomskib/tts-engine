'use client';

import { useState } from 'react';
import StatusBadge from './StatusBadge';
import { STATUS_COLUMNS, KILLED_CONFIG, PRIORITY_LABELS, PRIORITY_COLORS, RISK_BADGE, AGENTS } from './constants';
import type { TaskWithProject } from './constants';

interface Props {
  tasks: TaskWithProject[];
  onUpdateTask: (taskId: string, updates: Record<string, unknown>) => Promise<void>;
  onSelectTask: (task: TaskWithProject) => void;
  statusFilter: string;
  agentFilter: string;
  onStatusFilterChange: (v: string) => void;
  onAgentFilterChange: (v: string) => void;
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

function InlineStatusSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (status: string) => void;
}) {
  const allStatuses = [...STATUS_COLUMNS, KILLED_CONFIG];

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-transparent border-0 text-xs cursor-pointer focus:ring-0 p-0 appearance-none"
      style={{ color: 'inherit' }}
    >
      {allStatuses.map((s) => (
        <option key={s.dbValue} value={s.dbValue} className="bg-zinc-900 text-zinc-300">
          {s.label}
        </option>
      ))}
    </select>
  );
}

function InlineAgentEdit({
  value,
  onSave,
}: {
  value: string;
  onSave: (agent: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function handleSave() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setDraft(value);
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        className="bg-zinc-800 border border-zinc-600 rounded px-1.5 py-0.5 text-xs text-zinc-300 font-mono w-28"
      />
    );
  }

  return (
    <span
      className="text-xs text-zinc-400 font-mono cursor-pointer hover:text-zinc-200 hover:underline"
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Click to edit"
    >
      {value}
    </span>
  );
}

export default function TableView({
  tasks,
  onUpdateTask,
  onSelectTask,
  statusFilter,
  agentFilter,
  onStatusFilterChange,
  onAgentFilterChange,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {[...STATUS_COLUMNS, KILLED_CONFIG].map((s) => (
            <option key={s.dbValue} value={s.dbValue}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={agentFilter}
          onChange={(e) => onAgentFilterChange(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-1.5 text-sm"
        >
          <option value="">All agents</option>
          {AGENTS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="border border-zinc-800 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium">Task</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Assignee</th>
              <th className="px-4 py-3 font-medium">Due</th>
              <th className="px-4 py-3 font-medium">Priority</th>
              <th className="px-4 py-3 font-medium">Risk</th>
              <th className="px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {tasks.map((t) => {
              const riskInfo = RISK_BADGE[t.risk_tier as keyof typeof RISK_BADGE];
              return (
                <tr key={t.id} className="hover:bg-zinc-800/50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onSelectTask(t)}
                      className="text-left group"
                    >
                      <div className="text-zinc-300 group-hover:text-white">{t.title}</div>
                      {t.cc_projects?.name && (
                        <div className="text-xs text-zinc-600">{t.cc_projects.name}</div>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="relative">
                      <StatusBadge status={t.status} />
                      <div className="absolute inset-0 opacity-0 hover:opacity-100">
                        <InlineStatusSelect
                          value={t.status}
                          onChange={(status) => onUpdateTask(t.id, { status })}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <InlineAgentEdit
                      value={t.assigned_agent}
                      onSave={(agent) => onUpdateTask(t.id, { assigned_agent: agent })}
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {t.due_at
                      ? new Date(t.due_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${PRIORITY_COLORS[t.priority] || 'text-zinc-400'}`}>
                      {PRIORITY_LABELS[t.priority] || `P${t.priority}`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${riskInfo?.className || 'text-zinc-500'}`}>
                      {riskInfo?.label || t.risk_tier || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {timeAgo(t.updated_at)}
                  </td>
                </tr>
              );
            })}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  No tasks
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
