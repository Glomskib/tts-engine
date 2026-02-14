import { getPlanByStringId } from '@/lib/plans';

const PLAN_RANK: Record<string, number> = {
  free: 0,
  creator_lite: 1,
  creator_pro: 2,
  brand: 3,
  agency: 4,
};

export function meetsMinPlan(userPlan: string, required: string): boolean {
  return (PLAN_RANK[userPlan] ?? 0) >= (PLAN_RANK[required] ?? 0);
}

/**
 * Returns a gate error object if user's plan is too low, or null if they pass.
 * Admin users should bypass this check before calling.
 */
export function requirePlan(userPlan: string, minPlan: string, feature: string) {
  if (!meetsMinPlan(userPlan, minPlan)) {
    const planInfo = getPlanByStringId(minPlan);
    const planName = planInfo?.name || minPlan;
    return {
      ok: false,
      error: `${feature} requires the ${planName} plan or higher. Upgrade at /admin/billing.`,
      upgrade: true,
      requiredPlan: minPlan,
    };
  }
  return null;
}
