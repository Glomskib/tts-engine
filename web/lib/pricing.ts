// Source of truth for FlashFlow pricing. Update here and import everywhere.
// Stripe IDs created 2026-05-17 against acct_1SFkOWKXraIWnC5D.

export type Tier = {
  id: string;
  name: string;
  tagline: string;
  monthlyPriceUsd: number;
  annualPriceUsd: number;            // "2 months free" pricing (monthly * 10)
  stripeProductId: string | null;
  stripeMonthlyPriceId: string | null;
  stripeAnnualPriceId: string | null;
  clipsPerMonth: number | 'unlimited';
  scriptsPerMonth: number | 'unlimited';
  brandProfiles: number | 'unlimited';
  features: string[];
  ctaLabel: string;
  highlight?: boolean;
};

export const TIERS: Tier[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Try the platform — no card',
    monthlyPriceUsd: 0,
    annualPriceUsd: 0,
    stripeProductId: null,
    stripeMonthlyPriceId: null,
    stripeAnnualPriceId: null,
    clipsPerMonth: 3,
    scriptsPerMonth: 15,
    brandProfiles: 1,
    features: [
      '3 lifetime clips (no time limit)',
      '15 scripts per month',
      '1 brand voice profile',
      '720p output',
      '1 caption style',
      'TikTok + YouTube Shorts',
      'No watermark',
      '7-day clip storage',
    ],
    ctaLabel: 'Get Started Free',
  },
  {
    id: 'lite',
    name: 'Lite',
    tagline: 'New creators, low friction',
    monthlyPriceUsd: 9,
    annualPriceUsd: 90,
    stripeProductId: 'prod_UXACyufcSdPvke',
    stripeMonthlyPriceId: 'price_1TY5u5KXraIWnC5DP0Nwscnb',
    stripeAnnualPriceId: 'price_1TY5u9KXraIWnC5Dub4sRThK',
    clipsPerMonth: 15,
    scriptsPerMonth: 75,
    brandProfiles: 1,
    features: [
      '15 clips per month',
      '75 scripts per month',
      '1 brand voice profile',
      '1080p output',
      'All 6 caption styles',
      'All 5 aspect ratios',
      'No watermark',
      '30-day clip storage',
    ],
    ctaLabel: 'Choose Lite',
  },
  {
    id: 'creator',
    name: 'Creator',
    tagline: 'Solo creators going daily',
    monthlyPriceUsd: 19,
    annualPriceUsd: 190,
    stripeProductId: 'prod_UXACBacoqJ8oia',
    stripeMonthlyPriceId: 'price_1TY5uCKXraIWnC5DyQqG8TGQ',
    stripeAnnualPriceId: 'price_1TY5uFKXraIWnC5Dc0QDKPjn',
    clipsPerMonth: 40,
    scriptsPerMonth: 200,
    brandProfiles: 3,
    features: [
      '40 clips per month',
      '200 scripts per month',
      '3 brand voice profiles',
      '1080p output',
      'All caption styles',
      'Direct publish to TikTok / Reels / Shorts / IG / X',
      '60-day clip storage',
    ],
    ctaLabel: 'Choose Creator',
  },
  {
    id: 'creator-pro',
    name: 'Creator Pro',
    tagline: 'Multi-platform creators',
    monthlyPriceUsd: 29,
    annualPriceUsd: 290,
    stripeProductId: 'prod_UXACUd7RFcvpPb',
    stripeMonthlyPriceId: 'price_1TY5uJKXraIWnC5DWbGh5sM8',
    stripeAnnualPriceId: 'price_1TY5uMKXraIWnC5DT6VmnxOH',
    clipsPerMonth: 80,
    scriptsPerMonth: 500,
    brandProfiles: 5,
    features: [
      '80 clips per month',
      '500 scripts per month',
      '5 brand voice profiles',
      '100 voice-clone TTS words / month',
      'All caption styles + custom',
      '4K output',
      'Direct publish + scheduling',
      '90-day clip storage',
    ],
    ctaLabel: 'Choose Creator Pro',
    highlight: true,
  },
  {
    id: 'business',
    name: 'Business',
    tagline: 'Small businesses + 3 seats',
    monthlyPriceUsd: 59,
    annualPriceUsd: 590,
    stripeProductId: 'prod_UXACuGKcr1ubUY',
    stripeMonthlyPriceId: 'price_1TY5uQKXraIWnC5DSUEMOwHe',
    stripeAnnualPriceId: 'price_1TY5uTKXraIWnC5DHnsCf5Ht',
    clipsPerMonth: 200,
    scriptsPerMonth: 1500,
    brandProfiles: 10,
    features: [
      '200 clips per month',
      '1,500 scripts per month',
      '10 brand voice profiles',
      '1,000 voice-clone TTS words / month',
      'Custom caption fonts + colors',
      '4K output',
      'Direct publish + scheduling',
      '1-year clip storage',
      '3 team seats with role-based access',
    ],
    ctaLabel: 'Choose Business',
  },
  {
    id: 'fleet',
    name: 'Fleet',
    tagline: 'Agencies, 10+ brands',
    monthlyPriceUsd: 149,
    annualPriceUsd: 1490,
    stripeProductId: 'prod_UXAC9wdxy8GMQx',
    stripeMonthlyPriceId: 'price_1TY5uYKXraIWnC5DLvLQ0AxO',
    stripeAnnualPriceId: 'price_1TY5ubKXraIWnC5DXq7oVUw8',
    clipsPerMonth: 600,
    scriptsPerMonth: 'unlimited',
    brandProfiles: 25,
    features: [
      '600 clips per month',
      'Unlimited scripts',
      '25 brand voice profiles',
      'Unlimited voice-clone TTS',
      'White-label option',
      'Team seats with role-based access',
      'Dedicated onboarding',
      'Priority pipeline',
      'Lifetime clip storage',
    ],
    ctaLabel: 'Choose Fleet',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'White-label, dedicated infra',
    monthlyPriceUsd: 0,
    annualPriceUsd: 0,
    stripeProductId: null,
    stripeMonthlyPriceId: null,
    stripeAnnualPriceId: null,
    clipsPerMonth: 'unlimited',
    scriptsPerMonth: 'unlimited',
    brandProfiles: 'unlimited',
    features: [
      'Unlimited everything',
      'Dedicated infrastructure',
      'Custom SLAs',
      'Single sign-on',
      'White-label + custom domain',
      'Dedicated CSM',
    ],
    ctaLabel: 'Contact Sales',
  },
];

export const getTier = (id: string): Tier | undefined =>
  TIERS.find((t) => t.id === id);

export const PAID_TIERS = TIERS.filter((t) => t.monthlyPriceUsd > 0 && t.id !== 'enterprise');
