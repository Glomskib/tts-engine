/**
 * FlashFlow monetization pricing — single source of truth for the
 * 3-tier marketing/billing surface (Free / Creator / Pro) used by the
 * UpgradeModal, billing page, and daily usage limit enforcement.
 *
 * NOTE: `lib/plans.ts` is a separate, lower-level credit/plans config
 * (creator_lite, creator_pro, brand, agency). This file is the Phase 3
 * monetization surface only — keep the two decoupled and map between
 * them via `resolveBillingPlan()` below.
 *
 * `-1` means unlimited.
 */

export type PlanKey = 'free' | 'creator' | 'pro' | 'admin';

export interface PlanConfig {
  name: string;
  price: number;
  edits_per_day: number; // -1 = unlimited
  variations_per_video: number; // -1 = unlimited
  watermark: boolean;
  priority: boolean;
  bullets: string[];
}

export const PLANS: Record<PlanKey, PlanConfig> = {
  free: {
    name: 'Free',
    price: 0,
    edits_per_day: 3,
    variations_per_video: 1,
    watermark: true,
    priority: false,
    bullets: [
      '3 edits per day',
      '1 variation per video',
      'FlashFlow watermark',
    ],
  },
  creator: {
    name: 'Creator',
    price: 29,
    edits_per_day: 20,
    variations_per_video: -1,
    watermark: false,
    priority: false,
    bullets: [
      '20 edits per day',
      'Unlimited variations',
      'No watermark',
      'Winners Bank + insights',
    ],
  },
  pro: {
    name: 'Pro',
    price: 79,
    edits_per_day: 100,
    variations_per_video: -1,
    watermark: false,
    priority: true,
    bullets: [
      '100 edits per day',
      'Unlimited variations',
      'No watermark',
      'Priority render queue',
      'Multi-brand management',
    ],
  },
  admin: {
    name: 'Admin',
    price: 0,
    edits_per_day: -1,
    variations_per_video: -1,
    watermark: false,
    priority: true,
    bullets: ['Unlimited everything'],
  },
};

/**
 * Map a raw plan_id from `user_subscriptions` / entitlements to one of
 * the 3 monetization buckets. Keeps billing/plans.ts decoupled from the
 * legacy credit plan IDs in lib/plans.ts.
 */
export function resolveBillingPlan(planId: string | null | undefined): PlanKey {
  const p = (planId || 'free').toLowerCase();
  if (p === 'admin') return 'admin';
  if (p === 'free') return 'free';
  // legacy + new aliases that resolve to "creator"
  if (p === 'creator' || p === 'creator_lite' || p === 'starter' || p === 'team') {
    return 'creator';
  }
  // everything paid-and-bigger rolls up to pro
  if (
    p === 'pro' ||
    p === 'creator_pro' ||
    p === 'brand' ||
    p === 'agency' ||
    p === 'scale'
  ) {
    return 'pro';
  }
  return 'free';
}

export function isPaidBillingPlan(key: PlanKey): boolean {
  return key !== 'free';
}
