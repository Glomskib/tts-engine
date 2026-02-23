'use client';

import type { FeedbackItem } from '@/lib/command-center/feedback-types';
import { STATUS_CONFIG, TYPE_CONFIG, PRIORITY_CONFIG, timeAgo } from './constants';

interface Props {
  item: FeedbackItem;
  onClick: () => void;
}

export default function FeedbackItemRow({ item, onClick }: Props) {
  const typeConf = TYPE_CONFIG[item.type] || TYPE_CONFIG.other;
  const statusConf = STATUS_CONFIG[item.status] || STATUS_CONFIG.new;
  const priorityConf = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG[3];

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors"
    >
      {/* Type icon */}
      <span className="text-base shrink-0" title={typeConf.label}>{typeConf.icon}</span>

      {/* Title + reporter */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 truncate">{item.title}</p>
        {item.reporter_email && (
          <p className="text-xs text-zinc-500 truncate">{item.reporter_email}</p>
        )}
      </div>

      {/* Status badge */}
      <span className={`px-2 py-0.5 text-xs rounded-full shrink-0 ${statusConf.color} ${statusConf.bg}`}>
        {statusConf.label}
      </span>

      {/* Priority badge */}
      <span className={`text-xs shrink-0 ${priorityConf.color}`}>
        P{item.priority}
      </span>

      {/* Source tag */}
      <span className="text-xs text-zinc-600 shrink-0">{item.source}</span>

      {/* Time */}
      <span className="text-xs text-zinc-600 shrink-0 w-16 text-right">{timeAgo(item.created_at)}</span>
    </button>
  );
}
