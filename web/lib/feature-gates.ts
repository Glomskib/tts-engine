/**
 * Feature Gating System
 * Controls access to features based on user tier/plan
 */

export type UserTier = 'free' | 'lite' | 'pro' | 'business' | 'brand' | 'agency' | 'admin';

export type Feature =
  | 'content-studio'
  | 'transcriber'
  | 'script-library'
  | 'brands'
  | 'products'
  | 'calendar'
  | 'pipeline'
  | 'winners-bank'
  | 'analytics'
  | 'integrations'
  | 'team-management'
  | 'white-label';

export const FEATURE_ACCESS: Record<UserTier, Feature[] | '*'> = {
  free: ['content-studio', 'transcriber', 'script-library'],
  lite: ['content-studio', 'transcriber', 'script-library', 'brands', 'products', 'calendar'],
  pro: [
    'content-studio',
    'transcriber',
    'script-library',
    'brands',
    'products',
    'calendar',
    'pipeline',
    'winners-bank',
    'analytics',
  ],
  business: '*',
  brand: '*',
  agency: '*',
  admin: '*',
};

export const FEATURE_LIMITS: Record<UserTier, { brands?: number | null; products?: number | null; credits?: number | null }> = {
  free: { brands: 1, products: 5, credits: 5 },
  lite: { brands: 3, products: 50, credits: 50 },
  pro: { brands: 10, products: 500, credits: null }, // unlimited
  business: { brands: null, products: null, credits: null }, // unlimited
  brand: { brands: null, products: null, credits: null },
  agency: { brands: null, products: null, credits: null },
  admin: { brands: null, products: null, credits: null },
};

export function hasAccess(userTier: UserTier | string | null, feature: Feature): boolean {
  if (!userTier) return false;
  const normalizedTier = (userTier.toLowerCase() || 'free') as UserTier;
  const tierFeatures = FEATURE_ACCESS[normalizedTier] || FEATURE_ACCESS.free;
  return tierFeatures === '*' || (Array.isArray(tierFeatures) && tierFeatures.includes(feature));
}

export function getFeatureLimit(userTier: UserTier | string | null, limitType: 'brands' | 'products' | 'credits'): number | null {
  if (!userTier) return FEATURE_LIMITS.free[limitType] || 0;
  const normalizedTier = (userTier.toLowerCase() || 'free') as UserTier;
  return FEATURE_LIMITS[normalizedTier]?.[limitType] ?? 0;
}

export function canCreateMore(
  userTier: UserTier | string | null,
  limitType: 'brands' | 'products',
  currentCount: number
): boolean {
  const limit = getFeatureLimit(userTier, limitType);
  if (limit === null) return true; // unlimited
  return currentCount < limit;
}
