'use client';

import { RefreshCw } from 'lucide-react';
import { ReactNode } from 'react';

interface CCPageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  loading?: boolean;
  onRefresh?: () => void;
}

export default function CCPageHeader({
  title,
  subtitle,
  actions,
  loading,
  onRefresh,
}: CCPageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold text-white tracking-tight">{title}</h2>
        {subtitle && (
          <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {actions}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
      </div>
    </div>
  );
}
