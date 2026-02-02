/**
 * Centralized Pricing Configuration for FlashFlow AI
 * Single source of truth for all pricing, credits, and Stripe price IDs.
 */

export const STRIPE_PRICE_IDS = {
  // SaaS Plans
  starter: 'price_1SwB4RKXraIWnC5DRprfDEMn',
  creator: 'price_1SwB4zKXraIWnC5DAXICBLkl',
  business: 'price_1SwB7iKXraIWnC5Dxc8nmxVP',
  // Video Editing Plans
  video_starter: 'price_1SwB9OKXraIWnC5DB2hQ71xD',
  video_growth: 'price_1SwB9nKXraIWnC5DCMhmS43f',
  video_scale: 'price_1SwBANKXraIWnC5DZ5vjHN4i',
  video_agency: 'price_1SwBBXKXraIWnC5DSqrUgFGk',
} as const;

export const PRICING = {
  saas: {
    free: {
      id: 'free',
      name: 'Free',
      price: 0,
      credits: 5,
      period: 'forever',
      features: [
        { text: 'Skit Generator', included: true },
        { text: 'Basic character presets', included: true },
        { text: 'Save up to 3 skits', included: true },
        { text: 'Audience Intelligence', included: false },
        { text: 'Winners Bank', included: false },
        { text: 'B-Roll Generator', included: false },
      ],
    },
    starter: {
      id: 'starter',
      name: 'Starter',
      price: 9,
      credits: 75,
      period: '/month',
      stripePriceId: STRIPE_PRICE_IDS.starter,
      features: [
        { text: 'Everything in Free', included: true },
        { text: 'All character presets', included: true },
        { text: 'Unlimited saved skits', included: true },
        { text: 'Product catalog (5)', included: true },
        { text: 'Email support', included: true },
        { text: 'Audience Intelligence', included: false },
        { text: 'Winners Bank', included: false },
      ],
    },
    creator: {
      id: 'creator',
      name: 'Creator',
      price: 29,
      credits: 300,
      period: '/month',
      stripePriceId: STRIPE_PRICE_IDS.creator,
      popular: true,
      features: [
        { text: 'Everything in Starter', included: true },
        { text: 'Audience Intelligence', included: true },
        { text: 'Winners Bank', included: true },
        { text: 'B-Roll Generator', included: true },
        { text: 'Unlimited products', included: true },
        { text: 'Priority support', included: true },
      ],
    },
    business: {
      id: 'business',
      name: 'Business',
      price: 59,
      credits: 1000,
      period: '/month',
      stripePriceId: STRIPE_PRICE_IDS.business,
      features: [
        { text: 'Everything in Creator', included: true },
        { text: 'Up to 5 team members', included: true },
        { text: 'Shared workspaces', included: true },
        { text: 'Usage analytics', included: true },
        { text: 'Dedicated support', included: true },
      ],
    },
  },
  video: {
    video_starter: {
      id: 'video_starter',
      name: 'Starter',
      price: 89,
      videos: 45,
      credits: 300,
      perVideo: '$1.98',
      tagline: '~1-2 videos/day',
      aiIncluded: 'Creator tier (300 credits)',
      stripePriceId: STRIPE_PRICE_IDS.video_starter,
    },
    video_growth: {
      id: 'video_growth',
      name: 'Growth',
      price: 199,
      videos: 120,
      credits: 1000,
      perVideo: '$1.66',
      tagline: '~4 videos/day',
      aiIncluded: 'Business tier (1,000 credits)',
      stripePriceId: STRIPE_PRICE_IDS.video_growth,
      popular: true,
    },
    video_scale: {
      id: 'video_scale',
      name: 'Scale',
      price: 499,
      videos: 350,
      credits: 999999,
      perVideo: '$1.43',
      tagline: '~12 videos/day',
      aiIncluded: 'Unlimited AI credits',
      stripePriceId: STRIPE_PRICE_IDS.video_scale,
    },
    video_agency: {
      id: 'video_agency',
      name: 'Agency',
      price: 1150,
      videos: 1000,
      credits: 999999,
      perVideo: '$1.15',
      tagline: 'Full production team',
      aiIncluded: 'Unlimited AI credits',
      stripePriceId: STRIPE_PRICE_IDS.video_agency,
    },
  },
} as const;

export const VIDEO_QUOTAS: Record<string, number> = {
  video_starter: 45,
  video_growth: 120,
  video_scale: 350,
  video_agency: 1000,
};

export const CREDIT_ALLOCATIONS: Record<string, number> = {
  free: 5,
  starter: 75,
  creator: 300,
  business: 1000,
  video_starter: 300,
  video_growth: 1000,
  video_scale: 999999,
  video_agency: 999999,
};

export type SaaSPlanId = keyof typeof PRICING.saas;
export type VideoPlanId = keyof typeof PRICING.video;
export type PlanId = SaaSPlanId | VideoPlanId;

/**
 * Get plan details by ID
 */
export function getPlanById(planId: string) {
  if (planId in PRICING.saas) {
    return { ...PRICING.saas[planId as SaaSPlanId], type: 'saas' as const };
  }
  if (planId in PRICING.video) {
    return { ...PRICING.video[planId as VideoPlanId], type: 'video_editing' as const };
  }
  return null;
}

/**
 * Get Stripe price ID for a plan
 */
export function getStripePriceId(planId: string): string | null {
  return STRIPE_PRICE_IDS[planId as keyof typeof STRIPE_PRICE_IDS] || null;
}

/**
 * Check if plan is a video editing plan
 */
export function isVideoPlan(planId: string): boolean {
  return planId.startsWith('video_');
}

/**
 * Get credits for a plan
 */
export function getPlanCredits(planId: string): number {
  return CREDIT_ALLOCATIONS[planId] || 0;
}

/**
 * Get video quota for a plan
 */
export function getPlanVideos(planId: string): number {
  return VIDEO_QUOTAS[planId] || 0;
}
