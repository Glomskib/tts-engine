'use client';

import { useState } from 'react';
import { FolderPlus, ExternalLink, Loader2 } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

interface DriveFolderButtonProps {
  contentItemId: string;
  driveFolderUrl?: string | null;
  /** Callback when folder is created/ensured — passes new folder URL */
  onFolderReady?: (url: string, folderId: string) => void;
  /** Compact icon-only mode */
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
  const [loading, setLoading] = useState(false);
  const { showSuccess, showError } = useToast();

  const handleClick = async () => {
    // If folder already exists, just open it
    if (driveFolderUrl) {
      window.open(driveFolderUrl, '_blank', 'noopener');
      return;
    }

    // Create folder
    setLoading(true);
    try {
      const res = await fetch(`/api/content-items/${contentItemId}/drive/ensure`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.ok) {
        const url = json.data.drive_folder_url as string;
        const folderId = json.data.drive_folder_id as string;
        showSuccess(json.data.created ? 'Drive folder created' : 'Drive folder ready');
        onFolderReady?.(url, folderId);
        window.open(url, '_blank', 'noopener');
      } else {
        showError(json.error || json.message || 'Failed to create folder');
      }
    } catch {
      showError('Failed to create folder');
    } finally {
      setLoading(false);
    }
  };

  const hasFolder = !!driveFolderUrl;
  const Icon = loading ? Loader2 : hasFolder ? ExternalLink : FolderPlus;
  const label = loading ? 'Creating...' : hasFolder ? 'Open Drive' : 'Create Folder';

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={loading}
        title={label}
        className={`inline-flex items-center justify-center w-8 h-8 rounded-md text-zinc-400 hover:text-blue-400 hover:bg-zinc-800 transition disabled:opacity-50 ${className}`}
      >
        <Icon size={16} className={loading ? 'animate-spin' : ''} />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition disabled:opacity-50 ${
        hasFolder
          ? 'bg-blue-900/20 text-blue-300 hover:bg-blue-900/40'
          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
      } ${className}`}
    >
      <Icon size={14} className={loading ? 'animate-spin' : ''} />
      {label}
    </button>
  );
}
