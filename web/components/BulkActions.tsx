'use client';

import { useState } from 'react';
import {
  CheckSquare, Square, Trash2, Download, Tag,
  FolderInput, MoreHorizontal, X, Loader2
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface BulkActionsProps {
  selectedIds: string[];
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDelete?: () => Promise<void>;
  onExport?: () => void;
  onTag?: (tag: string) => Promise<void>;
  onMove?: (folderId: string) => Promise<void>;
  customActions?: Array<{
    label: string;
    icon: React.ReactNode;
    onClick: () => Promise<void>;
    variant?: 'default' | 'danger';
  }>;
}

export function BulkActions({
  selectedIds,
  totalCount,
  onSelectAll,
  onClearSelection,
  onDelete,
  onExport,
  onTag,
  onMove,
  customActions = [],
}: BulkActionsProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagValue, setTagValue] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  if (selectedIds.length === 0) return null;

  const handleAction = async (action: string, fn: () => Promise<void>) => {
    setLoading(action);
    try {
      await fn();
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <div className="fixed bottom-20 lg:bottom-4 inset-x-4 lg:inset-x-auto lg:left-1/2 lg:-translate-x-1/2 z-40">
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl p-4 flex items-center gap-4 max-w-2xl mx-auto">
          {/* Selection count */}
          <div className="flex items-center gap-2">
            <button
              onClick={selectedIds.length === totalCount ? onClearSelection : onSelectAll}
              className="p-1"
            >
              {selectedIds.length === totalCount ? (
                <CheckSquare className="w-5 h-5 text-teal-400" />
              ) : (
                <Square className="w-5 h-5 text-zinc-400" />
              )}
            </button>
            <span className="text-sm text-white font-medium">
              {selectedIds.length} selected
            </span>
            <button
              onClick={onClearSelection}
              className="p-1 hover:bg-zinc-800 rounded"
            >
              <X className="w-4 h-4 text-zinc-500" />
            </button>
          </div>

          <div className="h-6 w-px bg-zinc-700" />

          {/* Actions */}
          <div className="flex items-center gap-2">
            {onExport && (
              <button
                onClick={onExport}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-white transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            )}

            {onTag && (
              <div className="relative">
                <button
                  onClick={() => setShowTagInput(!showTagInput)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-white transition-colors"
                >
                  <Tag className="w-4 h-4" />
                  Tag
                </button>
                {showTagInput && (
                  <div className="absolute bottom-full left-0 mb-2 bg-zinc-800 border border-zinc-700 rounded-lg p-2 flex gap-2">
                    <input
                      type="text"
                      value={tagValue}
                      onChange={(e) => setTagValue(e.target.value)}
                      placeholder="Enter tag..."
                      className="w-32 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-sm text-white placeholder:text-zinc-500"
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        if (tagValue) {
                          handleAction('tag', () => onTag(tagValue));
                          setShowTagInput(false);
                          setTagValue('');
                        }
                      }}
                      disabled={!tagValue || loading === 'tag'}
                      className="px-2 py-1 bg-teal-600 text-white rounded text-sm disabled:opacity-50"
                    >
                      {loading === 'tag' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {customActions.map((action, i) => (
              <button
                key={i}
                onClick={() => handleAction(`custom-${i}`, action.onClick)}
                disabled={loading === `custom-${i}`}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  action.variant === 'danger'
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                }`}
              >
                {loading === `custom-${i}` ? <Loader2 className="w-4 h-4 animate-spin" /> : action.icon}
                {action.label}
              </button>
            ))}

            {onDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-sm transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={async () => {
          if (onDelete) {
            await handleAction('delete', onDelete);
          }
          setShowDeleteConfirm(false);
        }}
        title="Delete Selected Items"
        message={`Are you sure you want to delete ${selectedIds.length} items? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        isLoading={loading === 'delete'}
      />
    </>
  );
}

export default BulkActions;
