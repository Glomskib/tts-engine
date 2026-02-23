'use client';

import type { FeedbackStatus, FeedbackType } from '@/lib/command-center/feedback-types';

interface Props {
  statusFilter: FeedbackStatus | 'all';
  typeFilter: FeedbackType | 'all';
  priorityFilter: string;
  onStatusChange: (v: FeedbackStatus | 'all') => void;
  onTypeChange: (v: FeedbackType | 'all') => void;
  onPriorityChange: (v: string) => void;
}

export default function FeedbackFilterBar({
  statusFilter,
  typeFilter,
  priorityFilter,
  onStatusChange,
  onTypeChange,
  onPriorityChange,
}: Props) {
  const selectClass =
    'bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm';

  return (
    <div className="flex items-center gap-3">
      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value as FeedbackStatus | 'all')}
        className={selectClass}
      >
        <option value="all">All Statuses</option>
        <option value="new">New</option>
        <option value="triaged">Triaged</option>
        <option value="in_progress">In Progress</option>
        <option value="shipped">Shipped</option>
        <option value="rejected">Rejected</option>
      </select>

      <select
        value={typeFilter}
        onChange={(e) => onTypeChange(e.target.value as FeedbackType | 'all')}
        className={selectClass}
      >
        <option value="all">All Types</option>
        <option value="bug">Bug</option>
        <option value="feature">Feature</option>
        <option value="improvement">Improvement</option>
        <option value="support">Support</option>
        <option value="other">Other</option>
      </select>

      <select
        value={priorityFilter}
        onChange={(e) => onPriorityChange(e.target.value)}
        className={selectClass}
      >
        <option value="all">All Priorities</option>
        <option value="1">P1 Critical</option>
        <option value="2">P2 High</option>
        <option value="3">P3 Medium</option>
        <option value="4">P4 Low</option>
        <option value="5">P5 Minimal</option>
      </select>
    </div>
  );
}
