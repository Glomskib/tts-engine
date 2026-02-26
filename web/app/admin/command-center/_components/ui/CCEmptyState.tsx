'use client';

import { Inbox } from 'lucide-react';

interface CCEmptyStateProps {
  icon?: React.ElementType;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}

export default function CCEmptyState({
  icon: Icon = Inbox,
  title,
  body,
  action,
}: CCEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-zinc-500" />
      </div>
      <h3 className="text-sm font-medium text-zinc-300 mb-1">{title}</h3>
      {body && <p className="text-xs text-zinc-500 max-w-xs mb-4">{body}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
