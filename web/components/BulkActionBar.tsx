'use client';

import { useState } from 'react';

interface BulkAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  variant?: 'default' | 'danger';
  onClick: (selectedIds: string[]) => Promise<void> | void;
}

interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  selectedIds: string[];
  actions: BulkAction[];
  itemLabel?: string;
}

export default function BulkActionBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  selectedIds,
  actions,
  itemLabel = 'items',
}: BulkActionBarProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleAction = async (action: BulkAction) => {
    setLoading(action.id);
    try {
      await action.onClick(selectedIds);
    } finally {
      setLoading(null);
    }
  };

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-slide-in-up">
      <div className="flex items-center gap-4 px-4 py-3 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl">
        {/* Selection Count */}
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-violet-500/20 text-violet-400 font-semibold text-sm">
            {selectedCount}
          </span>
          <span className="text-zinc-300 text-sm whitespace-nowrap">
            {selectedCount === totalCount ? `All ${itemLabel}` : `${itemLabel}`} selected
          </span>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-white/10" />

        {/* Select All / Deselect */}
        <div className="flex items-center gap-2">
          {selectedCount < totalCount && (
            <button
              type="button"
              onClick={onSelectAll}
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Select all
            </button>
          )}
          <button
            type="button"
            onClick={onDeselectAll}
            className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Deselect
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-white/10" />

        {/* Actions */}
        <div className="flex items-center gap-2">
          {actions.map(action => (
            <button
              type="button"
              key={action.id}
              onClick={() => handleAction(action)}
              disabled={loading !== null}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                action.variant === 'danger'
                  ? 'text-red-400 hover:bg-red-500/20'
                  : 'text-zinc-300 hover:bg-white/10'
              }`}
            >
              {loading === action.id ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                action.icon
              )}
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Checkbox component for bulk selection
interface BulkSelectCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

export function BulkSelectCheckbox({ checked, onChange, className = '' }: BulkSelectCheckboxProps) {
  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`flex items-center justify-center w-5 h-5 rounded border transition-colors ${
        checked
          ? 'bg-violet-500 border-violet-500'
          : 'bg-transparent border-zinc-600 hover:border-zinc-400'
      } ${className}`}
    >
      {checked && (
        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}

// Hook for managing bulk selection
export function useBulkSelection<T extends { id: string }>(items: T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(items.map(item => item.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const isSelected = (id: string) => selectedIds.has(id);

  return {
    selectedIds: Array.from(selectedIds),
    selectedCount: selectedIds.size,
    toggle,
    selectAll,
    deselectAll,
    isSelected,
  };
}

// Common bulk action icons
export const BulkActionIcons = {
  delete: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  export: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  ),
  move: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  ),
  archive: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  ),
  favorite: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  ),
  status: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
};
