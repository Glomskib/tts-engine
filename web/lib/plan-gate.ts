/**
 * Plan Gate — server-side plan limit enforcement
 *
 * Two utilities:
 *
 *  1. `requirePlan(userPlan, minPlan, feature)` — feature-flag gate
 *     Returns error object if plan is too low, null if allowed.
 *     Used in pages/API routes that just need "is this plan high enough?"
 *
 *  2. `planGate(userId, feature, isAdmin, opts)` — usage-count gate
 *     Async — queries the DB, returns a NextResponse(402) if over limit.
 *     Drop into any POST/create route to block free users from creating
 *     more resources than their plan allows.
 *
 * Usage (feature gate):
 *   const gate = requirePlan(planId, 'creator_pro', 'Winners Bank');
 *   if (gate) return NextResponse.json(gate, { status: 402 });
 *
 * Usage (usage gate):
 *   const gate = await planGate(userId, 'brands', isAdmin, { table: 'brands' });
 *   if (gate) return gate;
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getPlanByStringId, migrateOldPlanId, isWithinLimit, getLimit, type PlanLimitKey } from '@/lib/plans';
import { generateCorrelationId } from '@/lib/api-errors';

// ── Feature-flag gate (synchronous) ─────────────────────────────────────────

const PLAN_RANK: Record<string, number> = {
  free: 0,
  creator_lite: 1,
  creator_pro: 2,
  business: 3,
  brand: 4,
  agency: 5,
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
      upgrade_url: '/admin/billing',
      requiredPlan: minPlan,
    };
  }
  return null;
}

// ── Usage-count gate (async) ─────────────────────────────────────────────────

interface PlanGateOpts {
  /** Override current usage count (skip the count query). */
  currentUsage?: number;
  /** Table to count rows in (used if currentUsage not provided). */
  table?: string;
  /** Column to filter on (default: 'user_id'). */
  filterColumn?: string;
}

const FEATURE_LABELS: Partial<Record<PlanLimitKey, string>> = {
  scriptsPerMonth: 'scripts per month',
  products: 'products',
  brands: 'brands',
  personas: 'personas',
  scriptLibrary: 'script library',
  winnersBank: 'winners bank',
  productionBoard: 'production board',
  contentCalendar: 'content calendar',
  analytics: 'analytics',
  apiAccess: 'API access',
};

/**
 * Check if a user is within their plan limit for a given feature.
 * Returns a NextResponse (402) if blocked, null if allowed.
 */
export async function planGate(
  userId: string,
  feature: PlanLimitKey,
  isAdmin: boolean,
  opts: PlanGateOpts = {},
): Promise<NextResponse | null> {
  if (isAdmin) return null;

  const correlationId = generateCorrelationId();

  // Get plan
  let planId = 'free';
  try {
    const { data: sub } = await supabaseAdmin
      .from('user_subscriptions')
      .select('plan_id')
      .eq('user_id', userId)
      .single();
    planId = migrateOldPlanId(sub?.plan_id ?? 'free');
  } catch {
    planId = 'free';
  }

  // Get current usage
  let currentUsage = opts.currentUsage;
  if (currentUsage === undefined && opts.table) {
    try {
      const col = opts.filterColumn ?? 'user_id';
      const { count } = await supabaseAdmin
        .from(opts.table)
        .select('id', { count: 'exact', head: true })
        .eq(col, userId);
      currentUsage = count ?? 0;
    } catch {
      currentUsage = 0;
    }
  }
  currentUsage ??= 0;

  if (isWithinLimit(planId, feature, currentUsage)) return null;

  const limit = getLimit(planId, feature);
  const featureLabel = FEATURE_LABELS[feature] ?? String(feature);

  return NextResponse.json(
    {
      ok: false,
      error: `You've reached your plan limit for ${featureLabel} (${currentUsage}/${limit === -1 ? '∞' : limit}). Upgrade to continue.`,
      error_code: 'PLAN_LIMIT',
      feature,
      current_usage: currentUsage,
      plan_limit: limit,
      plan_id: planId,
      upgrade: true,
      upgrade_url: '/admin/billing',
      correlation_id: correlationId,
    },
    { status: 402 },
  );
}
