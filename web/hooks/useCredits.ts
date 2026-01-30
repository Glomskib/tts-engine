'use client';

import { useState, useEffect, useCallback } from 'react';

interface Credits {
  remaining: number;
  usedThisPeriod: number;
  lifetimeUsed: number;
  freeCreditsTotal: number;
  freeCreditsUsed: number;
  periodStart: string | null;
  periodEnd: string | null;
}

interface Subscription {
  planId: string;
  planName: string;
  status: string;
  creditsPerMonth: number;
  billingPeriod: string | null;
  currentPeriodEnd: string | null;
}

interface UseCreditsReturn {
  credits: Credits | null;
  subscription: Subscription | null;
  isLoading: boolean;
  error: string | null;
  hasCredits: boolean;
  isFreeUser: boolean;
  refetch: () => Promise<void>;
  deductCredit: (description?: string, skitId?: string) => Promise<{ success: boolean; error?: string }>;
}

export function useCredits(): UseCreditsReturn {
  const [credits, setCredits] = useState<Credits | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCredits = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/credits');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch credits');
      }

      setCredits(data.credits);
      setSubscription(data.subscription);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch credits');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deductCredit = useCallback(async (description?: string, skitId?: string) => {
    try {
      const response = await fetch('/api/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, skitId }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Update local state with the returned balance
        if (data.creditsRemaining !== undefined) {
          setCredits(prev => prev ? { ...prev, remaining: data.creditsRemaining } : null);
        }
        return { success: false, error: data.error || 'Failed to deduct credit' };
      }

      // Update local state
      setCredits(prev => prev ? {
        ...prev,
        remaining: data.creditsRemaining,
        usedThisPeriod: prev.usedThisPeriod + 1,
        lifetimeUsed: prev.lifetimeUsed + 1,
      } : null);

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to deduct credit' };
    }
  }, []);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  const hasCredits = (credits?.remaining ?? 0) > 0;
  const isFreeUser = subscription?.planId === 'free';

  return {
    credits,
    subscription,
    isLoading,
    error,
    hasCredits,
    isFreeUser,
    refetch: fetchCredits,
    deductCredit,
  };
}

// Simple hook to just check if user has credits
export function useHasCredits(): { hasCredits: boolean; isLoading: boolean } {
  const { hasCredits, isLoading } = useCredits();
  return { hasCredits, isLoading };
}
