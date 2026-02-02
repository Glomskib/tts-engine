/**
 * Subscription management utilities for FlashFlow AI.
 * Handles both SaaS and video editing subscription types.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  PRICING,
  STRIPE_PRICE_IDS,
  VIDEO_QUOTAS,
  CREDIT_ALLOCATIONS,
  type SaaSPlanId,
  type VideoPlanId,
  type PlanId,
  getPlanById,
  getStripePriceId,
  isVideoPlan,
  getPlanCredits,
  getPlanVideos,
} from './pricing';

// Re-export pricing utilities
export {
  PRICING,
  STRIPE_PRICE_IDS,
  VIDEO_QUOTAS,
  CREDIT_ALLOCATIONS,
  getPlanById,
  getStripePriceId,
  isVideoPlan,
  getPlanCredits,
  getPlanVideos,
};

export type SaaSPlan = SaaSPlanId;
export type VideoPlan = VideoPlanId;
export type PlanName = PlanId;
export type SubscriptionType = 'saas' | 'video_editing';

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: PlanName;
  subscription_type: SubscriptionType;
  status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'paused';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  videos_per_month: number;
  videos_used_this_month: number;
  videos_remaining: number;
  current_period_start: string | null;
  current_period_end: string | null;
}

export interface PlanDetails {
  id: PlanName;
  name: string;
  price: number; // in cents
  type: SubscriptionType;
  credits: number;
  videos?: number;
  stripePriceId?: string;
}

// Build PLAN_DETAILS from centralized pricing config
export const PLAN_DETAILS: Record<PlanName, PlanDetails> = {
  // SaaS Plans
  free: {
    id: 'free',
    name: PRICING.saas.free.name,
    price: PRICING.saas.free.price * 100,
    type: 'saas',
    credits: PRICING.saas.free.credits,
  },
  starter: {
    id: 'starter',
    name: PRICING.saas.starter.name,
    price: PRICING.saas.starter.price * 100,
    type: 'saas',
    credits: PRICING.saas.starter.credits,
    stripePriceId: STRIPE_PRICE_IDS.starter,
  },
  creator: {
    id: 'creator',
    name: PRICING.saas.creator.name,
    price: PRICING.saas.creator.price * 100,
    type: 'saas',
    credits: PRICING.saas.creator.credits,
    stripePriceId: STRIPE_PRICE_IDS.creator,
  },
  business: {
    id: 'business',
    name: PRICING.saas.business.name,
    price: PRICING.saas.business.price * 100,
    type: 'saas',
    credits: PRICING.saas.business.credits,
    stripePriceId: STRIPE_PRICE_IDS.business,
  },
  // Video Editing Plans
  video_starter: {
    id: 'video_starter',
    name: 'Video ' + PRICING.video.video_starter.name,
    price: PRICING.video.video_starter.price * 100,
    type: 'video_editing',
    videos: PRICING.video.video_starter.videos,
    credits: PRICING.video.video_starter.credits,
    stripePriceId: STRIPE_PRICE_IDS.video_starter,
  },
  video_growth: {
    id: 'video_growth',
    name: 'Video ' + PRICING.video.video_growth.name,
    price: PRICING.video.video_growth.price * 100,
    type: 'video_editing',
    videos: PRICING.video.video_growth.videos,
    credits: PRICING.video.video_growth.credits,
    stripePriceId: STRIPE_PRICE_IDS.video_growth,
  },
  video_scale: {
    id: 'video_scale',
    name: 'Video ' + PRICING.video.video_scale.name,
    price: PRICING.video.video_scale.price * 100,
    type: 'video_editing',
    videos: PRICING.video.video_scale.videos,
    credits: PRICING.video.video_scale.credits,
    stripePriceId: STRIPE_PRICE_IDS.video_scale,
  },
  video_agency: {
    id: 'video_agency',
    name: 'Video ' + PRICING.video.video_agency.name,
    price: PRICING.video.video_agency.price * 100,
    type: 'video_editing',
    videos: PRICING.video.video_agency.videos,
    credits: PRICING.video.video_agency.credits,
    stripePriceId: STRIPE_PRICE_IDS.video_agency,
  },
};

/**
 * Get user's subscription
 */
export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
  const { data, error } = await supabaseAdmin
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) return null;
  return data as UserSubscription;
}

/**
 * Check if user has access to a specific feature
 */
export async function checkFeatureAccess(
  userId: string,
  featureKey: string
): Promise<{ allowed: boolean; limit?: number }> {
  // Get user's plan
  const { data: subscription } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id, status')
    .eq('user_id', userId)
    .single();

  if (!subscription || subscription.status !== 'active') {
    return { allowed: false };
  }

  // Check feature access for plan
  const { data: feature } = await supabaseAdmin
    .from('plan_features')
    .select('is_enabled, limit_value')
    .eq('plan_name', subscription.plan_id)
    .eq('feature_key', featureKey)
    .single();

  if (!feature) {
    return { allowed: false };
  }

  return {
    allowed: feature.is_enabled,
    limit: feature.limit_value ?? undefined,
  };
}

/**
 * Check if user is a video editing client
 */
export async function isVideoClient(userId: string): Promise<boolean> {
  const subscription = await getUserSubscription(userId);
  return subscription?.subscription_type === 'video_editing';
}

/**
 * Get remaining videos for video client
 */
export async function getVideosRemaining(userId: string): Promise<number> {
  const subscription = await getUserSubscription(userId);
  return subscription?.videos_remaining ?? 0;
}

/**
 * Deduct a video from user's monthly allocation
 */
export async function deductVideo(userId: string): Promise<{ success: boolean; remaining: number; error?: string }> {
  const { data, error } = await supabaseAdmin.rpc('deduct_video', {
    p_user_id: userId,
  });

  if (error) {
    return { success: false, remaining: 0, error: error.message };
  }

  const result = data?.[0];
  return {
    success: result?.success ?? false,
    remaining: result?.videos_remaining ?? 0,
    error: result?.message,
  };
}

/**
 * Update user's subscription (for webhook use)
 */
export async function updateSubscription(
  userId: string,
  updates: Partial<{
    plan_id: PlanName;
    subscription_type: SubscriptionType;
    status: string;
    stripe_subscription_id: string;
    stripe_customer_id: string;
    videos_per_month: number;
    videos_remaining: number;
    current_period_start: string;
    current_period_end: string;
  }>
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('user_subscriptions')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  return !error;
}

/**
 * Create or update subscription for a user
 */
export async function upsertSubscription(
  userId: string,
  data: Partial<UserSubscription>
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('user_subscriptions')
    .upsert({
      user_id: userId,
      ...data,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    });

  return !error;
}

/**
 * Get all features for a plan
 */
export async function getPlanFeatures(planName: PlanName): Promise<Record<string, { enabled: boolean; limit?: number }>> {
  const { data } = await supabaseAdmin
    .from('plan_features')
    .select('feature_key, is_enabled, limit_value')
    .eq('plan_name', planName);

  if (!data) return {};

  return data.reduce((acc, feature) => {
    acc[feature.feature_key] = {
      enabled: feature.is_enabled,
      limit: feature.limit_value ?? undefined,
    };
    return acc;
  }, {} as Record<string, { enabled: boolean; limit?: number }>);
}
