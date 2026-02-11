'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UsePollingOptions {
  /** Polling interval in milliseconds */
  interval: number;
  /** Whether polling is enabled */
  enabled?: boolean;
  /** Whether to run the fetch immediately on mount */
  immediate?: boolean;
}

interface UsePollingReturn {
  /** Seconds since last successful fetch */
  lastUpdatedSecondsAgo: number;
  /** Whether a fetch is currently in progress */
  isRefreshing: boolean;
  /** Trigger a manual refresh */
  refresh: () => void;
  /** Pause polling */
  pause: () => void;
  /** Resume polling */
  resume: () => void;
}

/**
 * Hook for polling data at a regular interval.
 *
 * Usage:
 * ```tsx
 * const { lastUpdatedSecondsAgo, isRefreshing, refresh } = usePolling(fetchData, {
 *   interval: 30000,
 *   enabled: true,
 * });
 * ```
 */
export function usePolling(
  fetchFn: () => Promise<void>,
  options: UsePollingOptions
): UsePollingReturn {
  const { interval, enabled = true, immediate = true } = options;
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [paused, setPaused] = useState(false);
  const fetchRef = useRef(fetchFn);
  const mountedRef = useRef(true);

  // Keep fetchFn ref current
  fetchRef.current = fetchFn;

  const doFetch = useCallback(async () => {
    if (!mountedRef.current) return;
    setIsRefreshing(true);
    try {
      await fetchRef.current();
      if (mountedRef.current) {
        setLastUpdated(Date.now());
      }
    } catch {
      // Errors should be handled by the caller
    } finally {
      if (mountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (immediate && enabled && !paused) {
      doFetch();
    }
  }, [immediate, enabled, paused, doFetch]);

  // Polling interval
  useEffect(() => {
    if (!enabled || paused) return;
    const id = setInterval(doFetch, interval);
    return () => clearInterval(id);
  }, [enabled, paused, interval, doFetch]);

  // Update "seconds ago" counter every second
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  // Cleanup
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    lastUpdatedSecondsAgo: secondsAgo,
    isRefreshing,
    refresh: doFetch,
    pause: () => setPaused(true),
    resume: () => setPaused(false),
  };
}

/**
 * Format seconds ago into a human-readable string.
 */
export function formatLastUpdated(secondsAgo: number): string {
  if (secondsAgo < 5) return 'Just now';
  if (secondsAgo < 60) return `${secondsAgo}s ago`;
  const minutes = Math.floor(secondsAgo / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}
