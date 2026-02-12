'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

interface PageErrorStateProps {
  message: string | null;
  onRetry?: () => void;
  correlationId?: string;
}

export function PageErrorState({ message, onRetry, correlationId }: PageErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
        <AlertTriangle className="w-6 h-6 text-red-400" />
      </div>
      <h3 className="text-lg font-medium text-zinc-200 mb-2">Something went wrong</h3>
      <p className="text-sm text-zinc-400 text-center max-w-md mb-4">
        {message || 'An unexpected error occurred. Please try again.'}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      )}
      {correlationId && (
        <p className="mt-4 text-xs text-zinc-600 font-mono">
          ID: {correlationId}
        </p>
      )}
    </div>
  );
}
