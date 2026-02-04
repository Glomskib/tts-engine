'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorMessageProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Inline error message component for API failures.
 * Shows error with optional retry button.
 */
export function ErrorMessage({
  message = 'Failed to load data',
  onRetry,
  className = '',
}: ErrorMessageProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-3">
        <AlertCircle className="w-6 h-6 text-red-400" />
      </div>
      <p className="text-sm text-zinc-400 mb-4">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-2 h-10 px-4 bg-zinc-800 text-white rounded-lg text-sm font-medium hover:bg-zinc-700 active:bg-zinc-600 transition-colors btn-press"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      )}
    </div>
  );
}

/**
 * Compact inline error for use in smaller spaces
 */
export function ErrorMessageCompact({
  message = 'Error loading',
  onRetry,
  className = '',
}: ErrorMessageProps) {
  return (
    <div className={`flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg ${className}`}>
      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
      <span className="text-sm text-red-400 flex-1">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-400 rounded text-xs font-medium hover:bg-red-500/30 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      )}
    </div>
  );
}

export default ErrorMessage;
