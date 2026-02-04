'use client';

import { useState } from 'react';
import type { ApiClientError } from '@/lib/http/fetchJson';

interface ApiErrorPanelProps {
  error: ApiClientError;
  /** Show debug details (default: auto-detect from URL or env) */
  showDebug?: boolean;
  /** Additional class names */
  className?: string;
  /** Callback when user dismisses the panel */
  onDismiss?: () => void;
}

/**
 * Check if debug mode is enabled
 * - ?debug=1 in URL
 * - localStorage debugMode = "1"
 * - NODE_ENV !== 'production'
 */
function isDebugMode(): boolean {
  if (typeof window === 'undefined') return false;

  // Check URL param
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('debug') === '1') return true;

  // Check localStorage
  try {
    if (localStorage.getItem('debugMode') === '1') return true;
  } catch {
    // localStorage not available
  }

  // Check if development
  if (process.env.NODE_ENV !== 'production') return true;

  return false;
}

/**
 * Human-readable error code labels
 */
const ERROR_CODE_LABELS: Record<string, string> = {
  UNAUTHORIZED: 'Authentication Required',
  FORBIDDEN: 'Access Denied',
  NOT_FOUND: 'Not Found',
  VALIDATION_ERROR: 'Validation Error',
  RATE_LIMITED: 'Rate Limited',
  CONFLICT: 'Conflict',
  GENERATION_IN_PROGRESS: 'Generation In Progress',
  AI_ERROR: 'AI Error',
  INTERNAL: 'Server Error',
  DB_ERROR: 'Database Error',
  BAD_REQUEST: 'Invalid Request',
};

/**
 * Standardized API error panel for admin UI.
 * Shows user-friendly message with correlation_id copy button.
 * Optionally shows debug details in an accordion.
 */
export default function ApiErrorPanel({
  error,
  showDebug,
  className = '',
  onDismiss,
}: ApiErrorPanelProps) {
  const [copied, setCopied] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const debugMode = showDebug ?? isDebugMode();
  const errorLabel = ERROR_CODE_LABELS[error.error_code] || error.error_code;

  const handleCopyCorrelationId = async () => {
    try {
      await navigator.clipboard.writeText(error.correlation_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <div
      className={`rounded border p-4 ${className}`}
      style={{
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderColor: 'rgba(239, 68, 68, 0.2)',
      }}
    >
      {/* Header with dismiss button */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          {/* Error code badge */}
          <span
            className="inline-block px-2 py-0.5 text-xs font-medium rounded mb-2"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              color: '#f87171',
            }}
          >
            {errorLabel}
          </span>

          {/* Main message */}
          <p
            className="text-sm font-medium"
            style={{ color: '#fca5a5' }}
          >
            {error.message}
          </p>
        </div>

        {onDismiss && (
          <button type="button"
            onClick={onDismiss}
            className="text-zinc-500 hover:text-zinc-300 p-1"
            aria-label="Dismiss error"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Correlation ID row */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs" style={{ color: '#71717a' }}>
          ID:
        </span>
        <code
          className="text-xs px-1.5 py-0.5 rounded font-mono"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            color: '#fca5a5',
          }}
        >
          {error.correlation_id}
        </code>
        <button type="button"
          onClick={handleCopyCorrelationId}
          className="text-xs px-2 py-0.5 rounded border transition-colors"
          style={{
            backgroundColor: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
            borderColor: copied ? '#10B981' : 'rgba(255, 255, 255, 0.1)',
            color: copied ? '#34d399' : '#a1a1aa',
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* HTTP status (subtle) */}
      {error.httpStatus > 0 && (
        <div className="mt-1">
          <span className="text-xs" style={{ color: '#52525b' }}>
            HTTP {error.httpStatus}
          </span>
        </div>
      )}

      {/* Debug details accordion */}
      {debugMode && error.details && Object.keys(error.details).length > 0 && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
          <button type="button"
            onClick={() => setDetailsOpen(!detailsOpen)}
            className="flex items-center gap-1 text-xs"
            style={{ color: '#71717a' }}
          >
            <svg
              className={`w-3 h-3 transition-transform ${detailsOpen ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Debug Details
          </button>

          {detailsOpen && (
            <pre
              className="mt-2 p-2 rounded text-xs overflow-auto max-h-40"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#fca5a5',
              }}
            >
              {JSON.stringify(error.details, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline error display (for toasts or tight spaces)
 */
export function ApiErrorInline({
  error,
  className = '',
}: {
  error: ApiClientError;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(error.correlation_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <div className={`flex items-center gap-2 text-sm ${className}`}>
      <span style={{ color: '#f87171' }}>{error.message}</span>
      <button type="button"
        onClick={handleCopy}
        className="text-xs px-1.5 py-0.5 rounded border"
        style={{
          backgroundColor: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
          borderColor: copied ? '#10B981' : 'rgba(255, 255, 255, 0.1)',
          color: copied ? '#34d399' : '#71717a',
        }}
        title={`Copy ID: ${error.correlation_id}`}
      >
        {copied ? 'Copied' : 'ID'}
      </button>
    </div>
  );
}
