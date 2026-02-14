/**
 * FlashFlow AI — Plan & Tier Definitions
 * Single source of truth for the 5-tier pricing model.
 *
 * Free → Creator Lite → Creator Pro → Brand → Agency
 * Brand is cheaper than Agency because brands are single companies;
 * agencies manage multiple brands.
 */

export const PLANS = {
  FREE: {
    id: 'free',
    name: 'Free',
    price: 0,
    credits: 5,
    stripePriceId: null,
    limits: {
      scriptsPerMonth: 5,
      editsPerMonth: 0,
      personas: 3,
      products: 3,
      brands: 1,
      contentPackages: false,
      scriptOfTheDay: false,
      apiAccess: false,
      clientPortal: false,
      creatorInviteLinks: false,
      contentApproval: false,
      affiliateDashboard: false,
    },
    features: [
      '5 scripts per month',
      '3 creator personas',
      '3 products',
      'TikTok Shop import',
    ],
  },
  CREATOR_LITE: {
    id: 'creator_lite',
    name: 'Creator Lite',
    price: 9,
    credits: 75,
    stripePriceId: process.env.STRIPE_PRICE_CREATOR_LITE?.trim() || null,
    limits: {
      scriptsPerMonth: 25,
      editsPerMonth: 5,
      personas: 5,
      products: 10,
      brands: 1,
      contentPackages: false,
      scriptOfTheDay: true,
      apiAccess: false,
      clientPortal: false,
      creatorInviteLinks: false,
      contentApproval: false,
      affiliateDashboard: true,
    },
    features: [
      '25 scripts per month',
      '5 AI video edits',
      '5 creator personas',
      '10 products',
      'Script of the Day',
      'Referral program',
    ],
  },
  CREATOR_PRO: {
    id: 'creator_pro',
    name: 'Creator Pro',
    price: 29,
    credits: 300,
    popular: true,
    stripePriceId: process.env.STRIPE_PRICE_CREATOR_PRO?.trim() || null,
    limits: {
      scriptsPerMonth: -1, // unlimited
      editsPerMonth: 25,
      personas: -1, // all
      products: 50,
      brands: 3,
      contentPackages: true,
      scriptOfTheDay: true,
      apiAccess: false,
      clientPortal: false,
      creatorInviteLinks: false,
      contentApproval: false,
      affiliateDashboard: true,
    },
    features: [
      'Unlimited scripts',
      '25 AI video edits',
      'All 7+ creator personas',
      '50 products',
      'Content Planner (daily bundles)',
      'Script of the Day',
      'Up to 3 brands',
      'Affiliate program (earn cash)',
    ],
  },
  BRAND: {
    id: 'brand',
    name: 'Brand',
    price: 49,
    credits: 1000,
    stripePriceId: process.env.STRIPE_PRICE_BRAND?.trim() || null,
    limits: {
      scriptsPerMonth: -1,
      editsPerMonth: 50,
      personas: -1,
      products: -1, // unlimited
      brands: 5,
      contentPackages: true,
      scriptOfTheDay: true,
      apiAccess: false,
      clientPortal: false,
      creatorInviteLinks: true,
      contentApproval: true,
      affiliateDashboard: true,
    },
    features: [
      'Unlimited scripts',
      '50 AI video edits',
      'All personas',
      'Unlimited products',
      'Creator invite links',
      'Content approval workflow',
      'AI product enrichment',
      'Up to 5 brands',
      'Affiliate program (earn cash)',
    ],
  },
  AGENCY: {
    id: 'agency',
    name: 'Agency',
    price: 149,
    credits: -1, // unlimited
    stripePriceId: process.env.STRIPE_PRICE_AGENCY?.trim() || null,
    limits: {
      scriptsPerMonth: -1,
      editsPerMonth: -1, // unlimited
      personas: -1,
      products: -1,
      brands: -1, // unlimited
      contentPackages: true,
      scriptOfTheDay: true,
      apiAccess: true,
      clientPortal: true,
      creatorInviteLinks: true,
      contentApproval: true,
      affiliateDashboard: true,
    },
    features: [
      'Unlimited everything',
      'Unlimited AI video edits',
      'All personas',
      'Unlimited products & brands',
      'Client portal',
      'API access',
      'Creator invite links',
      'Content approval workflow',
      'Priority support',
      'Affiliate program (earn cash)',
    ],
  },
} as const;

export type PlanKey = keyof typeof PLANS;
export type PlanLimitKey = keyof typeof PLANS.FREE.limits;

// Editing add-ons (work with any plan)
export const EDITING_ADDONS = {
  EDITING_ONLY: {
    id: 'editing_only',
    name: 'Editing Only',
    price: 19,
    editsPerMonth: 15,
    stripePriceId: process.env.STRIPE_PRICE_EDITING_ONLY?.trim() || null,
  },
  EDITING_ADDON: {
    id: 'editing_addon',
    name: 'Extra Edits Pack',
    price: 10,
    editsPerMonth: 10,
    stripePriceId: process.env.STRIPE_PRICE_EDITING_ADDON?.trim() || null,
  },
  PER_VIDEO: {
    id: 'per_video',
    name: 'Single Video Edit',
    price: 3,
    editsPerMonth: 1,
    stripePriceId: process.env.STRIPE_PRICE_PER_VIDEO?.trim() || null,
  },
} as const;

/**
 * Look up a plan config by its string id (e.g. 'creator_pro').
 * Returns undefined when the id doesn't match any plan.
 */
export function getPlanByStringId(planId: string): typeof PLANS[PlanKey] | undefined {
  const key = Object.keys(PLANS).find(
    k => PLANS[k as PlanKey].id === planId
  ) as PlanKey | undefined;
  return key ? PLANS[key] : undefined;
}

/**
 * All plan configs as an ordered array (cheapest → most expensive).
 */
export const PLANS_LIST = [
  PLANS.FREE,
  PLANS.CREATOR_LITE,
  PLANS.CREATOR_PRO,
  PLANS.BRAND,
  PLANS.AGENCY,
] as const;

/**
 * Check if a boolean feature is available on a plan.
 */
export function hasFeature(planId: string, feature: PlanLimitKey): boolean {
  const plan = getPlanByStringId(planId);
  if (!plan) return false;
  const value = plan.limits[feature];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return false;
}

/**
 * Check if usage is within a plan's numeric limit.
 * Returns true for unlimited (-1) or boolean features that are true.
 */
export function isWithinLimit(planId: string, feature: PlanLimitKey, currentUsage: number): boolean {
  const plan = getPlanByStringId(planId);
  if (!plan) return false;
  const limit = plan.limits[feature];
  if (typeof limit === 'boolean') return limit;
  if (limit === -1) return true; // unlimited
  return currentUsage < limit;
}

/**
 * Get the numeric limit value for a plan feature.
 * Returns -1 for unlimited, 0 for disabled booleans, the number otherwise.
 */
export function getLimit(planId: string, feature: PlanLimitKey): number {
  const plan = getPlanByStringId(planId);
  if (!plan) return 0;
  const value = plan.limits[feature];
  if (typeof value === 'boolean') return value ? -1 : 0;
  return value;
}

/**
 * Map old plan IDs to new plan IDs for backwards compatibility.
 * The old pricing system used: free, starter, creator, business
 * The new system uses: free, creator_lite, creator_pro, brand, agency
 */
export function migrateOldPlanId(oldPlanId: string): string {
  const mapping: Record<string, string> = {
    'free': 'free',
    'starter': 'creator_lite',
    'creator': 'creator_pro',
    'business': 'brand',
  };
  return mapping[oldPlanId] || oldPlanId;
}

/**
 * Get credits allocation for a plan (handles both old and new IDs).
 */
export function getPlanCredits(planId: string): number {
  const migrated = migrateOldPlanId(planId);
  const plan = getPlanByStringId(migrated);
  if (plan) return plan.credits;
  // Check video plans
  const videoPlan = getVideoPlanByStringId(planId);
  if (videoPlan) return videoPlan.credits;
  return 0;
}

// ─────────────────────────────────────────────────────
// Video Editing Service Plans
// ─────────────────────────────────────────────────────

export const VIDEO_PLANS = {
  VIDEO_STARTER: {
    id: 'video_starter' as const,
    name: 'Starter',
    type: 'video_editing' as const,
    price: 89,
    videos: 45,
    credits: 300,
    perVideo: '$1.98',
    tagline: '~1-2 videos/day',
    aiIncluded: 'Creator tier (300 credits)',
    stripePriceId: process.env.STRIPE_PRICE_VIDEO_STARTER?.trim() || null,
  },
  VIDEO_GROWTH: {
    id: 'video_growth' as const,
    name: 'Growth',
    type: 'video_editing' as const,
    price: 199,
    videos: 120,
    credits: 1000,
    perVideo: '$1.66',
    tagline: '~4 videos/day',
    aiIncluded: 'Business tier (1,000 credits)',
    popular: true as const,
    stripePriceId: process.env.STRIPE_PRICE_VIDEO_GROWTH?.trim() || null,
  },
  VIDEO_SCALE: {
    id: 'video_scale' as const,
    name: 'Scale',
    type: 'video_editing' as const,
    price: 499,
    videos: 350,
    credits: -1,
    perVideo: '$1.43',
    tagline: '~12 videos/day',
    aiIncluded: 'Unlimited AI credits',
    stripePriceId: process.env.STRIPE_PRICE_VIDEO_SCALE?.trim() || null,
  },
  VIDEO_AGENCY: {
    id: 'video_agency' as const,
    name: 'Agency',
    type: 'video_editing' as const,
    price: 1150,
    videos: 1000,
    credits: -1,
    perVideo: '$1.15',
    tagline: 'Full production team',
    aiIncluded: 'Unlimited AI credits',
    stripePriceId: process.env.STRIPE_PRICE_VIDEO_AGENCY?.trim() || null,
  },
} as const;

export type VideoPlanKey = keyof typeof VIDEO_PLANS;

export const VIDEO_PLANS_LIST = [
  VIDEO_PLANS.VIDEO_STARTER,
  VIDEO_PLANS.VIDEO_GROWTH,
  VIDEO_PLANS.VIDEO_SCALE,
  VIDEO_PLANS.VIDEO_AGENCY,
] as const;

/**
 * Look up a video plan by its string id (e.g. 'video_growth').
 */
export function getVideoPlanByStringId(planId: string) {
  const key = Object.keys(VIDEO_PLANS).find(
    k => VIDEO_PLANS[k as VideoPlanKey].id === planId
  ) as VideoPlanKey | undefined;
  return key ? VIDEO_PLANS[key] : undefined;
}

/**
 * Check if a plan ID belongs to a video editing plan.
 */
export function isVideoPlan(planId: string): boolean {
  return planId.startsWith('video_');
}

/**
 * Get video quota for a plan.
 */
export function getPlanVideos(planId: string): number {
  const plan = getVideoPlanByStringId(planId);
  return plan?.videos ?? 0;
}
