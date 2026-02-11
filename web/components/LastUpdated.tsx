'use client';

import { RefreshCw } from 'lucide-react';
import { formatLastUpdated } from '@/hooks/usePolling';

interface LastUpdatedProps {
  secondsAgo: number;
  isRefreshing: boolean;
  onRefresh: () => void;
  className?: string;
}

export function LastUpdated({ secondsAgo, isRefreshing, onRefresh, className = '' }: LastUpdatedProps) {
  return (
    <div className={`flex items-center gap-2 text-xs text-zinc-500 ${className}`}>
      <span>Updated {formatLastUpdated(secondsAgo)}</span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        className="p-1 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors disabled:opacity-50"
        aria-label="Refresh data"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}
