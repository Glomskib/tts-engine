'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { PRIORITY_COLORS, RISK_BADGE } from './constants';
import type { TaskWithProject } from './constants';

interface Props {
  task: TaskWithProject;
  onClick: () => void;
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

export default function TaskCard({ task, onClick }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const riskInfo = RISK_BADGE[task.risk_tier as keyof typeof RISK_BADGE];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group bg-zinc-800 border border-zinc-700/50 rounded-lg p-3 hover:border-zinc-600 cursor-pointer transition-colors"
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 p-0.5 text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0" onClick={onClick}>
          <p className="text-sm text-zinc-200 font-medium truncate">{task.title}</p>

          <div className="flex items-center gap-2 mt-2">
            {/* Priority dot */}
            <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[task.priority]?.replace('text-', 'bg-') || 'bg-zinc-500'}`} />

            {/* Assignee */}
            <span className="text-xs text-zinc-500 font-mono truncate">{task.assigned_agent}</span>

            {/* Risk badge (subtle) */}
            {riskInfo && task.risk_tier !== 'low' && (
              <span className={`text-xs ${riskInfo.className}`}>{riskInfo.label}</span>
            )}
          </div>

          <div className="flex items-center justify-between mt-2">
            {/* Due date */}
            {task.due_at && (
              <span className="text-xs text-zinc-500">
                {new Date(task.due_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            )}
            {/* Last update */}
            <span className="text-xs text-zinc-600 ml-auto">{timeAgo(task.updated_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
