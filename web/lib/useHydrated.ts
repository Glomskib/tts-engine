import { useState, useEffect } from 'react';

/**
 * Hook that returns true only after the component has hydrated on the client.
 * Use this to defer rendering of non-deterministic content (like relative times)
 * that would cause hydration mismatches.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated;
}

/**
 * Formats a date string to a relative time (e.g., "5m ago").
 * Returns null if not hydrated (for SSR safety).
 */
export function getTimeAgo(dateStr: string): string {
  try {
    const now = new Date();
    const date = new Date(dateStr);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return dateStr;
  }
}

/**
 * Formats a date string to a locale string.
 */
export function formatDateString(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
}
