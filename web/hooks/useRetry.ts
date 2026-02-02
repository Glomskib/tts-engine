'use client';

import { useState, useCallback } from 'react';

interface UseRetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: 'linear' | 'exponential';
  onError?: (error: Error, attempt: number) => void;
  onSuccess?: () => void;
  onMaxAttemptsReached?: (error: Error) => void;
}

interface UseRetryReturn<T> {
  execute: () => Promise<T | undefined>;
  isRetrying: boolean;
  attempt: number;
  error: Error | null;
  reset: () => void;
}

/**
 * Hook for executing async functions with automatic retry logic
 */
export function useRetry<T>(
  fn: () => Promise<T>,
  options: UseRetryOptions = {}
): UseRetryReturn<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoff = 'exponential',
    onError,
    onSuccess,
    onMaxAttemptsReached,
  } = options;

  const [isRetrying, setIsRetrying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const getDelay = useCallback(
    (attemptNumber: number) => {
      if (backoff === 'exponential') {
        return delayMs * Math.pow(2, attemptNumber - 1);
      }
      return delayMs * attemptNumber;
    },
    [backoff, delayMs]
  );

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const execute = useCallback(async (): Promise<T | undefined> => {
    setIsRetrying(true);
    setError(null);

    for (let i = 1; i <= maxAttempts; i++) {
      setAttempt(i);

      try {
        const result = await fn();
        setIsRetrying(false);
        onSuccess?.();
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onError?.(error, i);

        if (i === maxAttempts) {
          setIsRetrying(false);
          onMaxAttemptsReached?.(error);
          return undefined;
        }

        // Wait before next attempt
        const delay = getDelay(i);
        await sleep(delay);
      }
    }

    setIsRetrying(false);
    return undefined;
  }, [fn, maxAttempts, getDelay, onError, onSuccess, onMaxAttemptsReached]);

  const reset = useCallback(() => {
    setIsRetrying(false);
    setAttempt(0);
    setError(null);
  }, []);

  return {
    execute,
    isRetrying,
    attempt,
    error,
    reset,
  };
}

/**
 * Simple retry wrapper for one-off operations
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 1; i <= maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (i < maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, delayMs * Math.pow(2, i - 1))
        );
      }
    }
  }

  throw lastError;
}
