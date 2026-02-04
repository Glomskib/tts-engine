'use client';

import { useState } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface RetryButtonProps {
  onRetry: () => Promise<void>;
  errorMessage?: string;
  className?: string;
  variant?: 'inline' | 'standalone';
}

export function RetryButton({
  onRetry,
  errorMessage,
  className = '',
  variant = 'inline',
}: RetryButtonProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  if (variant === 'standalone') {
    return (
      <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6 text-red-400" />
        </div>
        {errorMessage && (
          <p className="text-sm text-zinc-400 mb-4 text-center max-w-xs">
            {errorMessage}
          </p>
        )}
        <button
          type="button"
          onClick={handleRetry}
          disabled={isRetrying}
          className="flex items-center gap-2 h-10 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
          {isRetrying ? 'Retrying...' : 'Try Again'}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleRetry}
      disabled={isRetrying}
      className={`flex items-center gap-1.5 text-sm text-teal-400 hover:text-teal-300 transition-colors disabled:opacity-50 ${className}`}
    >
      <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
      {isRetrying ? 'Retrying...' : 'Retry'}
    </button>
  );
}

// Error state with retry for data fetching
interface FetchErrorProps {
  error: Error | string;
  onRetry?: () => Promise<void>;
  className?: string;
}

export function FetchError({ error, onRetry, className = '' }: FetchErrorProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    if (!onRetry) return;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  const message = typeof error === 'string' ? error : error.message;

  return (
    <div className={`bg-red-500/10 border border-red-500/30 rounded-xl p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-red-400 font-medium">Failed to load</p>
          <p className="text-sm text-zinc-400 mt-1">{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isRetrying}
              className="flex items-center gap-1.5 mt-3 text-sm text-teal-400 hover:text-teal-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Retrying...' : 'Try again'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
