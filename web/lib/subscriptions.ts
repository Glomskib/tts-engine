/**
 * Subscription management utilities for FlashFlow AI.
 * Derives all plan data from the canonical source: lib/plans.ts
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  PLANS,
  PLANS_LIST,
  VIDEO_PLANS,
  VIDEO_PLANS_LIST,
  EDITING_ADDONS,
  getPlanByStringId,
  getVideoPlanByStringId,
  migrateOldPlanId,
  isVideoPlan,
  getPlanCredits,
  getPlanVideos,
  type PlanKey,
  type PlanLimitKey,
  type VideoPlanKey,
} from './plans';

// Re-export plan utilities and data
export {
  PLANS,
  PLANS_LIST,
  VIDEO_PLANS,
  VIDEO_PLANS_LIST,
  EDITING_ADDONS,
  getPlanByStringId,
  getVideoPlanByStringId,
  migrateOldPlanId,
  isVideoPlan,
  getPlanCredits,
  getPlanVideos,
};

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

export type SaaSPlanId = typeof PLANS[PlanKey]['id'];
export type VideoPlanId = typeof VIDEO_PLANS[VideoPlanKey]['id'];
export type PlanName = SaaSPlanId | VideoPlanId;
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
  id: string;
  name: string;
  price: number; // in cents
  type: SubscriptionType;
  credits: number;
  videos?: number;
  stripePriceId?: string | null;
}

// ─────────────────────────────────────────────────────
// Derived constants (built from plans.ts)
// ─────────────────────────────────────────────────────

/** Plan details keyed by plan ID — used by webhook, checkout, status routes */
export const PLAN_DETAILS: Record<string, PlanDetails> = {};

/** Stripe price IDs keyed by plan ID */
export const STRIPE_PRICE_IDS: Record<string, string> = {};

/** Credit allocations keyed by plan ID */
export const CREDIT_ALLOCATIONS: Record<string, number> = {};

/** Video quotas keyed by plan ID */
export const VIDEO_QUOTAS: Record<string, number> = {};

// Build from SaaS plans
for (const plan of PLANS_LIST) {
  PLAN_DETAILS[plan.id] = {
    id: plan.id,
    name: plan.name,
    price: plan.price * 100,
    type: 'saas',
    credits: plan.credits,
    stripePriceId: plan.stripePriceId,
  };
  if (plan.stripePriceId) {
    STRIPE_PRICE_IDS[plan.id] = plan.stripePriceId;
  }
  CREDIT_ALLOCATIONS[plan.id] = plan.credits;
}

// Build from video plans
for (const plan of VIDEO_PLANS_LIST) {
  PLAN_DETAILS[plan.id] = {
    id: plan.id,
    name: 'Video ' + plan.name,
    price: plan.price * 100,
    type: 'video_editing',
    credits: plan.credits,
    videos: plan.videos,
    stripePriceId: plan.stripePriceId,
  };
  if (plan.stripePriceId) {
    STRIPE_PRICE_IDS[plan.id] = plan.stripePriceId;
  }
  CREDIT_ALLOCATIONS[plan.id] = plan.credits;
  VIDEO_QUOTAS[plan.id] = plan.videos;
}

// Legacy aliases — existing DB records may use old plan IDs
PLAN_DETAILS['starter'] = PLAN_DETAILS['creator_lite'];
PLAN_DETAILS['creator'] = PLAN_DETAILS['creator_pro'];
PLAN_DETAILS['business'] = PLAN_DETAILS['brand'];
CREDIT_ALLOCATIONS['starter'] = CREDIT_ALLOCATIONS['creator_lite'];
CREDIT_ALLOCATIONS['creator'] = CREDIT_ALLOCATIONS['creator_pro'];
CREDIT_ALLOCATIONS['business'] = CREDIT_ALLOCATIONS['brand'];

// ─────────────────────────────────────────────────────
// PRICING — backwards-compatible nested object for upgrade page
// ─────────────────────────────────────────────────────

export const PRICING = {
  saas: Object.fromEntries(
    PLANS_LIST.map(p => [p.id, { ...p, period: p.price === 0 ? 'forever' : '/month' }])
  ) as Record<string, typeof PLANS_LIST[number] & { period: string }>,
  video: Object.fromEntries(
    VIDEO_PLANS_LIST.map(p => [p.id, p])
  ) as Record<string, typeof VIDEO_PLANS_LIST[number]>,
} as const;

// ─────────────────────────────────────────────────────
// Subscription management functions
// ─────────────────────────────────────────────────────

export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
  const { data, error } = await supabaseAdmin
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) return null;
  return data as UserSubscription;
}

export async function checkFeatureAccess(
  userId: string,
  featureKey: string
): Promise<{ allowed: boolean; limit?: number }> {
  const { data: subscription } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id, status')
    .eq('user_id', userId)
    .single();

  if (!subscription || subscription.status !== 'active') {
    return { allowed: false };
  }

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

export async function isVideoClient(userId: string): Promise<boolean> {
  const subscription = await getUserSubscription(userId);
  return subscription?.subscription_type === 'video_editing';
}

export async function getVideosRemaining(userId: string): Promise<number> {
  const subscription = await getUserSubscription(userId);
  return subscription?.videos_remaining ?? 0;
}

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

export async function updateSubscription(
  userId: string,
  updates: Partial<{
    plan_id: string;
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

export async function getPlanFeatures(planName: string): Promise<Record<string, { enabled: boolean; limit?: number }>> {
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
