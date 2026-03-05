'use client';

import { useState } from 'react';
import { FolderOpen, Loader2, ExternalLink } from 'lucide-react';

interface DriveFolderButtonProps {
  contentItemId: string;
  driveFolderUrl?: string | null;
  onFolderReady?: (url: string, folderId: string) => void;
  compact?: boolean;
  className?: string;
}

export default function DriveFolderButton({
  contentItemId,
  driveFolderUrl,
  onFolderReady,
  compact = false,
  className = '',
}: DriveFolderButtonProps) {
  const [creating, setCreating] = useState(false);

  if (driveFolderUrl) {
    return (
      <a
        href={driveFolderUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-2 ${
          compact
            ? 'px-3 py-1.5 text-xs'
            : 'px-4 py-2.5 text-sm min-h-[44px]'
        } bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-colors font-medium ${className}`}
      >
        <FolderOpen className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        {compact ? 'Drive' : 'Open Drive Folder'}
        <ExternalLink className="w-3 h-3" />
      </a>
    );
  }

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch(`/api/content-items/${contentItemId}/drive-folder`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.ok && json.data) {
        onFolderReady?.(json.data.url, json.data.folder_id);
      }
    } catch {
      // silently fail — the button will remain in "create" state
    } finally {
      setCreating(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCreate}
      disabled={creating}
      className={`inline-flex items-center gap-2 ${
        compact
          ? 'px-3 py-1.5 text-xs'
          : 'px-4 py-2.5 text-sm min-h-[44px]'
      } bg-zinc-800 text-zinc-400 border border-white/10 rounded-lg hover:bg-zinc-700 transition-colors font-medium disabled:opacity-50 ${className}`}
    >
      {creating ? (
        <Loader2 className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} animate-spin`} />
      ) : (
        <FolderOpen className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      )}
      {compact ? 'Create Folder' : 'Create Drive Folder'}
    </button>
  );
}
