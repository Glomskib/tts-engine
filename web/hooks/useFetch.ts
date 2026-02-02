'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface FetchState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  isValidating: boolean;
}

interface UseFetchOptions<T> {
  /** Initial data before fetch */
  initialData?: T;
  /** Skip initial fetch (manual trigger only) */
  skip?: boolean;
  /** Auto-refetch interval in ms */
  refreshInterval?: number;
  /** Retry failed requests */
  retryCount?: number;
  /** Delay between retries in ms */
  retryDelay?: number;
  /** Cache key for deduplication */
  cacheKey?: string;
  /** Called on successful fetch */
  onSuccess?: (data: T) => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

interface UseFetchReturn<T> extends FetchState<T> {
  /** Manually trigger a refetch */
  refetch: () => Promise<T | null>;
  /** Mutate local data without refetching */
  mutate: (data: T | ((current: T | null) => T)) => void;
  /** Reset to initial state */
  reset: () => void;
}

// Simple in-memory cache
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

/**
 * Custom hook for data fetching with loading states, caching, and retry logic
 */
export function useFetch<T>(
  fetcher: () => Promise<T>,
  options: UseFetchOptions<T> = {}
): UseFetchReturn<T> {
  const {
    initialData = null,
    skip = false,
    refreshInterval,
    retryCount = 0,
    retryDelay = 1000,
    cacheKey,
    onSuccess,
    onError,
  } = options;

  const [state, setState] = useState<FetchState<T>>({
    data: initialData as T | null,
    isLoading: !skip && !initialData,
    error: null,
    isValidating: false,
  });

  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const fetchWithRetry = useCallback(
    async (attempt = 0): Promise<T> => {
      try {
        return await fetcherRef.current();
      } catch (err) {
        if (attempt < retryCount) {
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelay * Math.pow(2, attempt))
          );
          return fetchWithRetry(attempt + 1);
        }
        throw err;
      }
    },
    [retryCount, retryDelay]
  );

  const refetch = useCallback(async (): Promise<T | null> => {
    setState((prev) => ({
      ...prev,
      isValidating: true,
      error: null,
    }));

    try {
      const data = await fetchWithRetry();

      if (!mountedRef.current) return null;

      // Update cache
      if (cacheKey) {
        cache.set(cacheKey, { data, timestamp: Date.now() });
      }

      setState({
        data,
        isLoading: false,
        error: null,
        isValidating: false,
      });

      onSuccess?.(data);
      return data;
    } catch (err) {
      if (!mountedRef.current) return null;

      const error = err instanceof Error ? err : new Error(String(err));

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error,
        isValidating: false,
      }));

      onError?.(error);
      return null;
    }
  }, [fetchWithRetry, cacheKey, onSuccess, onError]);

  const mutate = useCallback((data: T | ((current: T | null) => T)) => {
    setState((prev) => ({
      ...prev,
      data: typeof data === 'function' ? (data as (current: T | null) => T)(prev.data) : data,
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      data: initialData as T | null,
      isLoading: false,
      error: null,
      isValidating: false,
    });
  }, [initialData]);

  // Initial fetch
  useEffect(() => {
    if (skip) return;

    // Check cache first
    if (cacheKey) {
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setState({
          data: cached.data as T,
          isLoading: false,
          error: null,
          isValidating: false,
        });
        return;
      }
    }

    refetch();
  }, [skip, cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh interval
  useEffect(() => {
    if (!refreshInterval || skip) return;

    const interval = setInterval(refetch, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval, skip, refetch]);

  // Cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    ...state,
    refetch,
    mutate,
    reset,
  };
}

/**
 * Clear all cached data
 */
export function clearFetchCache() {
  cache.clear();
}

/**
 * Clear specific cache entry
 */
export function invalidateCache(key: string) {
  cache.delete(key);
}
