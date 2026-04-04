import { migrateOldPlanId, PLAN_RANK } from '@/lib/plans';

/** Radar-specific plan limits */
export interface RadarPlanLimits {
  maxWatchedCreators: number;
  scansPerDay: number;
  maxVisibleOpportunities: number | null; // null = unlimited
  /** Minimum plan required to access Opportunity Radar at all */
  minPlan: string;
}

/**
 * Keyed by canonical plan IDs (post-migrateOldPlanId).
 * Note: 'business' is mapped to 'brand' by migrateOldPlanId,
 * so we include both as aliases pointing to the same limits.
 */
export const RADAR_LIMITS: Record<string, RadarPlanLimits> = {
  free: { maxWatchedCreators: 5, scansPerDay: 1, maxVisibleOpportunities: 10, minPlan: 'free' },
  creator_lite: { maxWatchedCreators: 15, scansPerDay: 2, maxVisibleOpportunities: 50, minPlan: 'creator_lite' },
  creator_pro: { maxWatchedCreators: 50, scansPerDay: 4, maxVisibleOpportunities: null, minPlan: 'creator_pro' },
  brand: { maxWatchedCreators: 200, scansPerDay: 8, maxVisibleOpportunities: null, minPlan: 'brand' },
  agency: { maxWatchedCreators: 500, scansPerDay: 12, maxVisibleOpportunities: null, minPlan: 'agency' },
};

/** Get radar limits for a plan, handling old plan IDs */
export function getRadarLimits(planId: string | null): RadarPlanLimits {
  const resolved = planId ? migrateOldPlanId(planId) : 'free';
  return RADAR_LIMITS[resolved] || RADAR_LIMITS.free;
}

/** Check if a workspace can add another creator to their watchlist */
export function canAddCreator(planId: string | null, currentCount: number): { allowed: boolean; limit: number; message?: string } {
  const limits = getRadarLimits(planId);
  if (currentCount >= limits.maxWatchedCreators) {
    return {
      allowed: false,
      limit: limits.maxWatchedCreators,
      message: `You've reached your limit of ${limits.maxWatchedCreators} watched creators on the ${resolvedPlanName(planId)} plan. Upgrade for more.`,
    };
  }
  return { allowed: true, limit: limits.maxWatchedCreators };
}

/** Get human-readable plan name */
function resolvedPlanName(planId: string | null): string {
  const NAMES: Record<string, string> = {
    free: 'Free', creator_lite: 'Lite', creator_pro: 'Pro',
    brand: 'Brand', agency: 'Agency',
  };
  const resolved = planId ? migrateOldPlanId(planId) : 'free';
  return NAMES[resolved] || 'Free';
}

/** Get scan interval in hours based on plan scansPerDay */
export function getScanIntervalHours(planId: string | null): number {
  const limits = getRadarLimits(planId);
  return Math.ceil(24 / limits.scansPerDay);
}

/** Get display-friendly limit info for UI */
export function getRadarLimitDisplay(planId: string | null, currentWatched: number): {
  planName: string;
  maxCreators: number;
  currentCreators: number;
  scansPerDay: number;
  usagePercent: number;
  atLimit: boolean;
  upgradeMessage: string | null;
} {
  const limits = getRadarLimits(planId);
  const name = resolvedPlanName(planId);
  const atLimit = currentWatched >= limits.maxWatchedCreators;

  // Suggest next tier upgrade
  let upgradeMessage: string | null = null;
  if (atLimit) {
    const resolved = planId ? migrateOldPlanId(planId) : 'free';
    const rank = PLAN_RANK[resolved] ?? 0;
    const nextTier = Object.entries(PLAN_RANK).find(([, r]) => r === rank + 1);
    if (nextTier) {
      const nextLimits = RADAR_LIMITS[nextTier[0]];
      if (nextLimits) {
        upgradeMessage = `Upgrade to ${resolvedPlanName(nextTier[0])} for up to ${nextLimits.maxWatchedCreators} creators and ${nextLimits.scansPerDay}x/day scanning.`;
      }
    }
  }

  return {
    planName: name,
    maxCreators: limits.maxWatchedCreators,
    currentCreators: currentWatched,
    scansPerDay: limits.scansPerDay,
    usagePercent: Math.round((currentWatched / limits.maxWatchedCreators) * 100),
    atLimit,
    upgradeMessage,
  };
}
