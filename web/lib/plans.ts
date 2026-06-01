/**
 * FlashFlow AI — Plan & Tier Definitions
 * Single source of truth for the 4-tier /create pricing model (2026-05-12).
 *
 * Free → Starter ($19) → Creator ($49) → Pro ($99) → Content Fleet (contact)
 *
 * Stripe price IDs live in Vercel env (STRIPE_PRICE_*) so we never hardcode.
 * Legacy lite/pro/business/brand/agency entries are kept under LEGACY_PLANS
 * below for any old subscriber lookups — do not surface in new UI.
 */

// New pricing structure with monthly/annual billing
export interface PricingBilling {
  price: number;
  display: string;
  monthlyEquiv?: string;
  stripePriceId: string | null;
  savings?: string;
}

export interface PricingPlan {
  name: string;
  monthly?: PricingBilling;
  annual?: PricingBilling;
  credits?: number | null;
  features: string[];
  badge?: string;
  contactUs?: boolean;
  contactEmail?: string;
}

/**
 * CANONICAL 2026-05-12 — the 4-tier /create model.
 * Free is 3 clips LIFETIME (not /mo) to force upgrade after trying it.
 */
export const PRICING_PLANS: Record<string, PricingPlan> = {
  free: {
    name: 'Free',
    monthly: { price: 0, display: 'Free', stripePriceId: null },
    credits: 3, // lifetime
    features: [
      '3 clips total (no time limit, no card)',
      '720p output',
      '1 caption style (Bold Yellow)',
      'TikTok + YouTube Shorts',
      'No watermark',
      '7-day clip storage',
    ],
  },
  starter: {
    name: 'Starter',
    monthly: {
      // Canonical price per PRICING-CREATE-V1.md (vault, 2026-05-12). The
      // old `price: 9, display: '$19'` divergence meant the page rendered
      // $9/mo while the Stripe charge was $19/mo. Fixed in incident 2026-05-27.
      price: 19,
      display: '$19',
      stripePriceId: process.env.STRIPE_PRICE_STARTER || 'price_1TWJflKXraIWnC5DeVyEv1R5',
    },
    credits: 50,
    features: [
      '50 clips a month',
      'All 6 caption styles, all 5 aspect ratios',
      '1 brand voice locked in',
      'Direct publish to TikTok, Reels, Shorts, IG, X',
      '1080p · 30-day storage · no watermark',
    ],
  },
  creator: {
    name: 'Creator',
    monthly: {
      price: 49, // was 19; see Starter note above
      display: '$49',
      stripePriceId: process.env.STRIPE_PRICE_CREATOR || 'price_1TWJgNKXraIWnC5DmD4Hv3Yw',
    },
    credits: 200,
    badge: 'Most Popular',
    features: [
      '200 clips a month',
      'Custom caption styles',
      '3 brand voices',
      '100 voice-clone words/mo',
      '90-day storage · direct publish · overage $0.20/credit',
    ],
  },
  pro: {
    name: 'Pro',
    monthly: {
      price: 99, // was 29; see Starter note above
      display: '$99',
      stripePriceId: process.env.STRIPE_PRICE_PRO || 'price_1TWJh7KXraIWnC5DKFScwFcC',
    },
    credits: 500,
    features: [
      '500 clips a month',
      '4K output · custom font + color captions',
      '10 brand voices',
      '1,000 voice-clone words/mo',
      '1-year storage · direct publish + scheduling',
    ],
  },
  content_fleet: {
    name: 'Fleet',
    contactUs: true,
    contactEmail: 'miles@makingmilesmatter.com',
    features: [
      'For agencies running 5+ client brands',
      'Unlimited clips',
      'Unlimited brand profiles',
      'Team seats',
      'White-label option',
      'Lifetime clip storage',
      'Dedicated onboarding + priority pipeline',
      'Case-by-case pricing',
    ],
  },
};

/**
 * LEGACY plans — old subscribers may still be mapped here. Do NOT surface in
 * new UI. Read-only for subscription state lookups; new signups land on the
 * canonical PRICING_PLANS above.
 */
export const LEGACY_PLANS: Record<string, PricingPlan> = {
  lite: {
    name: 'Lite (legacy)',
    monthly: { price: 9, display: '$9', stripePriceId: 'price_1T0XzpKXraIWnC5D79InCCm4' },
    credits: 50,
    features: ['Legacy plan — migrated to Starter'],
  },
  creator_pro: {
    name: 'Creator Pro (legacy)',
    monthly: { price: 29, display: '$29', stripePriceId: 'price_1T0XzqKXraIWnC5Dwsdf6evK' },
    credits: null,
    features: ['Legacy plan — migrated to Creator'],
  },
  business: {
    name: 'Business (legacy)',
    monthly: { price: 59, display: '$59', stripePriceId: 'price_1SwB7iKXraIWnC5Dxc8nmxVP' },
    credits: null,
    features: ['Legacy plan — migrated to Pro'],
  },
};

// ── Ops Service Plans (Mission Control as a Service) ──────────────────────────
// Separate product line: AI-powered operational dashboards for businesses.
// Price IDs are read from env vars so you never need to edit code:
//   STRIPE_OPS_STARTER_MONTHLY, STRIPE_OPS_STARTER_ANNUAL
//   STRIPE_OPS_PRO_MONTHLY,     STRIPE_OPS_PRO_ANNUAL
export const OPS_PLANS: Record<string, PricingPlan> = {
  ops_starter: {
    name: 'Ops Starter',
    monthly: { price: 99, display: '$99', stripePriceId: process.env.STRIPE_OPS_STARTER_MONTHLY || null },
    annual: {
      price: 948,
      display: '$948',
      monthlyEquiv: '$79',
      stripePriceId: process.env.STRIPE_OPS_STARTER_ANNUAL || null,
      savings: '$240',
    },
    features: [
      'System health verdict',
      'Up to 3 lanes',
      'Up to 5 agents',
      'Integration health monitoring',
      'Daily ops brief',
      'Client view (shareable)',
    ],
  },
  ops_pro: {
    name: 'Ops Pro',
    monthly: { price: 299, display: '$299', stripePriceId: process.env.STRIPE_OPS_PRO_MONTHLY || null },
    annual: {
      price: 2868,
      display: '$2,868',
      monthlyEquiv: '$239',
      stripePriceId: process.env.STRIPE_OPS_PRO_ANNUAL || null,
      savings: '$720',
    },
    badge: 'Most Popular',
    features: [
      'Everything in Starter',
      'Unlimited lanes & agents',
      'Intelligence insights (stale detection, revenue blockers)',
      'Intervention queue with quick actions',
      'Trust signals & proof tracking',
      'API access',
      'Slack/email alerts',
    ],
  },
  ops_enterprise: {
    name: 'Ops Enterprise',
    contactUs: true,
    contactEmail: 'brandon@flashflowai.com',
    features: [
      'Everything in Pro',
      'Custom integrations',
      'Multi-org management',
      'White-label client portal',
      'SLA-backed uptime',
      'Dedicated onboarding',
    ],
  },
};

export function isOpsPlanConfigured(): boolean {
  return Boolean(
    OPS_PLANS.ops_starter.monthly?.stripePriceId &&
    OPS_PLANS.ops_pro.monthly?.stripePriceId
  );
}

// ── Avatar Engine Plans (HeyGen-backed AI spokesperson product) ───────────────
// Separate product line from PRICING_PLANS — do NOT merge with /create tiers.
// Existing PRICING_PLANS customers continue on their current plans untouched.
//
// Avatar Engine is sold as its own subscription: render quota + avatar profile
// count + workflow features (batch script gen, A/B hooks, white-label, etc.).
//
// Stripe price IDs are read from env vars so they're swappable per environment:
//   STRIPE_AVATAR_CREATOR_MONTHLY / _ANNUAL
//   STRIPE_AVATAR_PRO_MONTHLY     / _ANNUAL
//   STRIPE_AVATAR_AGENCY_MONTHLY  / _ANNUAL
// Until Stripe products are created, these fall back to null and the checkout
// CTA should disable / route to "contact" — same pattern as OPS_PLANS.
export const AVATAR_PLANS: Record<string, PricingPlan> = {
  avatar_creator: {
    name: 'Avatar Creator',
    monthly: {
      price: 29,
      display: '$29',
      stripePriceId: process.env.STRIPE_AVATAR_CREATOR_MONTHLY || process.env.STRIPE_AVATAR_CREATOR || null,
    },
    annual: {
      // 17% off: $29 × 12 = $348 → $290 ($24.16/mo)
      price: 290,
      display: '$290',
      monthlyEquiv: '$24',
      stripePriceId: process.env.STRIPE_AVATAR_CREATOR_ANNUAL || null,
      savings: '$58',
    },
    credits: 30,
    features: [
      '30 HeyGen avatar renders / month',
      '1 avatar profile',
      'Basic script + scene editor',
      'Direct publish to TikTok, Reels, Shorts',
      'All niche presets (10+ archetypes)',
      'Performance dashboard',
    ],
  },
  avatar_pro: {
    name: 'Avatar Pro',
    monthly: {
      price: 149,
      display: '$149',
      stripePriceId: process.env.STRIPE_AVATAR_PRO_MONTHLY || process.env.STRIPE_AVATAR_PRO || null,
    },
    annual: {
      // 17% off: $149 × 12 = $1,788 → $1,490 ($124/mo)
      price: 1490,
      display: '$1,490',
      monthlyEquiv: '$124',
      stripePriceId: process.env.STRIPE_AVATAR_PRO_ANNUAL || null,
      savings: '$298',
    },
    credits: 200,
    badge: 'Most Popular',
    features: [
      '200 renders / month',
      '3 avatar profiles',
      'Batch script generation (30 scripts at once)',
      'Product overlay + hook A/B testing',
      'Multi-platform daily auto-post scheduler',
      'Custom voice training (clone your own)',
      'Everything in Creator',
    ],
  },
  avatar_agency: {
    name: 'Avatar Agency',
    monthly: {
      price: 499,
      display: '$499',
      stripePriceId: process.env.STRIPE_AVATAR_AGENCY_MONTHLY || process.env.STRIPE_AVATAR_AGENCY || null,
    },
    annual: {
      // 20% off (bigger spenders get bigger discount): $499 × 12 = $5,988 → $4,790 ($399/mo)
      price: 4790,
      display: '$4,790',
      monthlyEquiv: '$399',
      stripePriceId: process.env.STRIPE_AVATAR_AGENCY_ANNUAL || null,
      savings: '$1,198',
    },
    credits: 1000,
    features: [
      '1,000 renders / month',
      '10 avatar profiles',
      'White-label (your branding on client deliverables)',
      'Team seats (3 included)',
      'Brand-monetization CRM (track affiliate deals + payouts)',
      'Priority render queue',
      'Dedicated success contact',
    ],
  },
};

export function isAvatarPlanConfigured(): boolean {
  return Boolean(
    AVATAR_PLANS.avatar_creator.monthly?.stripePriceId &&
    AVATAR_PLANS.avatar_pro.monthly?.stripePriceId &&
    AVATAR_PLANS.avatar_agency.monthly?.stripePriceId
  );
}

/** True if a plan ID belongs to the Avatar Engine product line. */
export function isAvatarPlan(planId: string): boolean {
  return planId === 'avatar_creator' || planId === 'avatar_pro' || planId === 'avatar_agency';
}

/** Render quota for an Avatar Engine plan. Returns 0 for unknown plans. */
export const AVATAR_RENDER_LIMITS: Record<string, number> = {
  avatar_creator: 30,
  avatar_pro: 200,
  avatar_agency: 1000,
};

export function getAvatarRenderLimit(planId: string): number {
  return AVATAR_RENDER_LIMITS[planId] ?? 0;
}

// Legacy plan structure for backwards compatibility
export const PLANS = {
  FREE: {
    id: 'free',
    name: 'Free',
    price: 0,
    credits: 5,
    stripePriceId: null,
    limits: {
      scriptsPerMonth: 5,
      products: 3,
      brands: 0,
      personas: 0,          // built-in only
      scriptLibrary: false,
      scriptOfTheDay: false,
      contentPackages: false,
      winnersBank: false,
      winnerPatterns: false,
      customPersonas: false,
      productionBoard: false,
      contentCalendar: false,
      analytics: false,
      templates: false,
      apiAccess: false,
      referrals: false,
    },
    features: [
      '5 credits / month',
      '5 scripts / month',
      '3 products',
      'Built-in personas',
      'TikTok Shop import',
    ],
  },
  CREATOR_LITE: {
    id: 'creator_lite',
    name: 'Creator Lite',
    price: 9,
    credits: 50,
    stripePriceId: process.env.STRIPE_PRICE_CREATOR_LITE?.trim() || null,
    limits: {
      scriptsPerMonth: 50,
      products: 20,
      brands: 0,
      personas: 0,          // built-in only
      scriptLibrary: true,
      scriptOfTheDay: false,
      contentPackages: false,
      winnersBank: false,
      winnerPatterns: false,
      customPersonas: false,
      productionBoard: false,
      contentCalendar: false,
      analytics: false,
      templates: false,
      apiAccess: false,
      referrals: true,
    },
    features: [
      '50 credits / month',
      '50 scripts / month',
      '20 products',
      'Script Library',
      'Built-in personas',
      'Referral program',
    ],
  },
  CREATOR_PRO: {
    id: 'creator_pro',
    name: 'Creator Pro',
    price: 29,
    credits: -1, // unlimited
    popular: true,
    stripePriceId: process.env.STRIPE_PRICE_CREATOR_PRO?.trim() || null,
    limits: {
      scriptsPerMonth: -1, // unlimited
      products: -1,        // unlimited
      brands: -1,          // unlimited
      personas: -1,        // unlimited
      scriptLibrary: true,
      scriptOfTheDay: true,
      contentPackages: false,
      winnersBank: true,
      winnerPatterns: true,
      customPersonas: true,
      productionBoard: true,
      contentCalendar: true,
      analytics: true,
      templates: true,
      apiAccess: false,
      referrals: true,
    },
    features: [
      'Unlimited credits',
      'Unlimited scripts',
      'Unlimited products & brands',
      'All personas + custom',
      'Winners Bank & Patterns',
      'Production Board',
      'Content Calendar',
      'Analytics & Templates',
      'Script of the Day',
      'Referral program',
    ],
  },
  BUSINESS: {
    id: 'business',
    name: 'Business',
    price: 59,
    credits: -1, // unlimited
    stripePriceId: process.env.STRIPE_PRICE_BUSINESS?.trim() || null,
    limits: {
      scriptsPerMonth: -1,
      products: -1,
      brands: -1,
      personas: -1,
      scriptLibrary: true,
      scriptOfTheDay: true,
      contentPackages: false,
      winnersBank: true,
      winnerPatterns: true,
      customPersonas: true,
      productionBoard: true,
      contentCalendar: true,
      analytics: true,
      templates: true,
      apiAccess: false,
      referrals: true,
    },
    features: [
      'Everything in Creator Pro',
      'Priority support',
      'Custom integrations',
      'Unlimited brands',
    ],
  },
  // Contact-only tiers (no checkout)
  BRAND: {
    id: 'brand',
    name: 'Brand',
    price: 0, // contact us
    credits: -1, // unlimited
    stripePriceId: null,
    limits: {
      scriptsPerMonth: -1,
      products: -1,
      brands: -1,
      personas: -1,
      scriptLibrary: true,
      scriptOfTheDay: true,
      contentPackages: true,
      winnersBank: true,
      winnerPatterns: true,
      customPersonas: true,
      productionBoard: true,
      contentCalendar: true,
      analytics: true,
      templates: true,
      apiAccess: false,
      referrals: true,
    },
    features: [
      'AI challenge generator',
      'Creator marketplace',
      'Campaign analytics',
    ],
  },
  AGENCY: {
    id: 'agency',
    name: 'Agency',
    price: 0, // contact us
    credits: -1, // unlimited
    stripePriceId: null,
    limits: {
      scriptsPerMonth: -1,
      products: -1,
      brands: -1,
      personas: -1,
      scriptLibrary: true,
      scriptOfTheDay: true,
      contentPackages: true,
      winnersBank: true,
      winnerPatterns: true,
      customPersonas: true,
      productionBoard: true,
      contentCalendar: true,
      analytics: true,
      templates: true,
      apiAccess: true,
      referrals: true,
    },
    features: [
      'Multi-brand management',
      'Team seats',
      'White-label options',
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
  PLANS.BUSINESS,
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

// ─────────────────────────────────────────────────────
// Plan Hierarchy / Gating
// ─────────────────────────────────────────────────────

export const PLAN_RANK: Record<string, number> = {
  free: 0,
  creator_lite: 1,
  creator_pro: 2,
  business: 3,
  brand: 4,
  agency: 5,
};

/**
 * Check if a user's plan meets or exceeds a minimum required plan.
 */
export function meetsMinPlan(userPlan: string, minPlan: string): boolean {
  return (PLAN_RANK[userPlan] ?? 0) >= (PLAN_RANK[minPlan] ?? 0);
}

/**
 * Check if a plan ID belongs to a video editing plan.
 */
export function isVideoPlan(planId: string): boolean {
  return planId.startsWith('video_');
}

// ─────────────────────────────────────────────────────
// FlashFlow Render Plans
// Creator: $29/mo — 30 renders/mo
// Pro:     $79/mo — 100 renders/mo
//
// These plans gate the video editing engine (upload → analyze → render).
// Price IDs come from env vars so they can differ between Stripe accounts.
// ─────────────────────────────────────────────────────

export const FLASHFLOW_PLANS = {
  FF_CREATOR: {
    id: 'ff_creator' as const,
    name: 'Creator',
    price: 29,
    rendersPerMonth: 30,
    stripePriceId: process.env.STRIPE_PRICE_FF_CREATOR?.trim() || null,
    features: [
      '30 video renders / month',
      'Upload → Analyze → Render pipeline',
      'AI-generated edit plans',
      'Guided mode onboarding',
    ],
  },
  FF_PRO: {
    id: 'ff_pro' as const,
    name: 'Pro',
    price: 79,
    rendersPerMonth: 100,
    stripePriceId: process.env.STRIPE_PRICE_FF_PRO?.trim() || null,
    popular: true,
    features: [
      '100 video renders / month',
      'Upload → Analyze → Render pipeline',
      'AI-generated edit plans',
      'Priority processing',
      'Guided mode onboarding',
    ],
  },
} as const;

export type FlashFlowPlanKey = keyof typeof FLASHFLOW_PLANS;
export type FlashFlowPlanId = typeof FLASHFLOW_PLANS[FlashFlowPlanKey]['id'];

export const FLASHFLOW_PLANS_LIST = [
  FLASHFLOW_PLANS.FF_CREATOR,
  FLASHFLOW_PLANS.FF_PRO,
] as const;

/** Render limit for a given FlashFlow plan ID. -1 = unlimited (admin/legacy). */
export const FF_RENDER_LIMITS: Record<string, number> = {
  ff_creator: 30,
  ff_pro: 100,
  // Legacy/admin plans — no render cap
  creator_pro: -1,
  business: -1,
  brand: -1,
  agency: -1,
};

/** True if this plan ID is a FlashFlow render plan. */
export function isFlashFlowPlan(planId: string): boolean {
  return planId === 'ff_creator' || planId === 'ff_pro';
}

/** Render limit for a plan. Returns -1 for unlimited, 0 for unknown/free plans. */
export function getPlanRenderLimit(planId: string): number {
  return FF_RENDER_LIMITS[planId] ?? 0;
}

/**
 * Get video quota for a plan.
 */
export function getPlanVideos(planId: string): number {
  const plan = getVideoPlanByStringId(planId);
  return plan?.videos ?? 0;
}
