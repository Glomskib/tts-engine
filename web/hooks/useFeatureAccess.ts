/**
 * Feature access hook for FlashFlow AI.
 * Checks if user has access to specific features based on their subscription plan.
 */

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { PlanName } from '@/lib/subscriptions';

export interface FeatureAccess {
  allowed: boolean;
  limit?: number;
  loading: boolean;
  error?: string;
}

export interface SubscriptionInfo {
  planId: PlanName | null;
  subscriptionType: 'saas' | 'video_editing' | null;
  status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'paused' | null;
  videosRemaining?: number;
  videosPerMonth?: number;
  loading: boolean;
}

// Cache for feature access to avoid repeated queries
const featureCache = new Map<string, { allowed: boolean; limit?: number; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

/**
 * Hook to check if user has access to a specific feature
 */
export function useFeatureAccess(featureKey: string): FeatureAccess {
  const [access, setAccess] = useState<FeatureAccess>({
    allowed: false,
    loading: true,
  });

  useEffect(() => {
    let mounted = true;

    async function checkAccess() {
      const supabase = createBrowserSupabaseClient();

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (mounted) {
          setAccess({ allowed: false, loading: false, error: 'Not authenticated' });
        }
        return;
      }

      // Check cache
      const cacheKey = `${user.id}:${featureKey}`;
      const cached = featureCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        if (mounted) {
          setAccess({ allowed: cached.allowed, limit: cached.limit, loading: false });
        }
        return;
      }

      try {
        // Get user's subscription
        const { data: subscription, error: subError } = await supabase
          .from('user_subscriptions')
          .select('plan_id, status')
          .eq('user_id', user.id)
          .single();

        if (subError || !subscription) {
          // No subscription = free plan
          const { data: feature } = await supabase
            .from('plan_features')
            .select('is_enabled, limit_value')
            .eq('plan_name', 'free')
            .eq('feature_key', featureKey)
            .single();

          const result = {
            allowed: feature?.is_enabled ?? false,
            limit: feature?.limit_value ?? undefined,
          };

          featureCache.set(cacheKey, { ...result, timestamp: Date.now() });
          if (mounted) {
            setAccess({ ...result, loading: false });
          }
          return;
        }

        // Check if subscription is active
        if (subscription.status !== 'active' && subscription.status !== 'trialing') {
          if (mounted) {
            setAccess({ allowed: false, loading: false, error: 'Subscription not active' });
          }
          return;
        }

        // Get feature access for plan
        const { data: feature, error: featureError } = await supabase
          .from('plan_features')
          .select('is_enabled, limit_value')
          .eq('plan_name', subscription.plan_id)
          .eq('feature_key', featureKey)
          .single();

        if (featureError) {
          if (mounted) {
            setAccess({ allowed: false, loading: false });
          }
          return;
        }

        const result = {
          allowed: feature?.is_enabled ?? false,
          limit: feature?.limit_value ?? undefined,
        };

        featureCache.set(cacheKey, { ...result, timestamp: Date.now() });
        if (mounted) {
          setAccess({ ...result, loading: false });
        }
      } catch (err) {
        if (mounted) {
          setAccess({
            allowed: false,
            loading: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }

    checkAccess();

    return () => {
      mounted = false;
    };
  }, [featureKey]);

  return access;
}

/**
 * Hook to get user's subscription info
 */
export function useSubscription(): SubscriptionInfo {
  const [info, setInfo] = useState<SubscriptionInfo>({
    planId: null,
    subscriptionType: null,
    status: null,
    loading: true,
  });

  useEffect(() => {
    let mounted = true;

    async function fetchSubscription() {
      const supabase = createBrowserSupabaseClient();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (mounted) {
          setInfo({
            planId: 'free',
            subscriptionType: 'saas',
            status: 'active',
            loading: false,
          });
        }
        return;
      }

      const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select('plan_id, subscription_type, status, videos_remaining, videos_per_month')
        .eq('user_id', user.id)
        .single();

      if (mounted) {
        if (subscription) {
          setInfo({
            planId: subscription.plan_id as PlanName,
            subscriptionType: subscription.subscription_type as 'saas' | 'video_editing',
            status: subscription.status as SubscriptionInfo['status'],
            videosRemaining: subscription.videos_remaining,
            videosPerMonth: subscription.videos_per_month,
            loading: false,
          });
        } else {
          setInfo({
            planId: 'free',
            subscriptionType: 'saas',
            status: 'active',
            loading: false,
          });
        }
      }
    }

    fetchSubscription();

    return () => {
      mounted = false;
    };
  }, []);

  return info;
}

/**
 * Hook to check if user is a video editing client
 */
export function useIsVideoClient(): { isVideoClient: boolean; loading: boolean } {
  const subscription = useSubscription();

  return {
    isVideoClient: subscription.subscriptionType === 'video_editing',
    loading: subscription.loading,
  };
}

/**
 * Clear the feature cache (call when subscription changes)
 */
export function clearFeatureCache(): void {
  featureCache.clear();
}

/**
 * Invalidate cache for a specific user
 */
export function invalidateUserCache(userId: string): void {
  for (const key of featureCache.keys()) {
    if (key.startsWith(userId)) {
      featureCache.delete(key);
    }
  }
}
