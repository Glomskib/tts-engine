/**
 * Daily usage tracking + soft quotas for FlashFlow Phase 3.
 *
 * Admins and users on paid plans are unlimited on most kinds. Free tier
 * has soft caps that trigger the existing UpgradeModal via
 * `{ upgrade: true }` responses from the API.
 *
 * The per-plan caps for `edits` and `variations` are read from
 * `lib/billing/plans.ts` (the Phase 3 monetization source of truth).
 * Legacy kinds (`scripts_generated`, `pipeline_items`, `renders`) keep
 * their existing free-tier numbers.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { PLANS, resolveBillingPlan, type PlanKey } from '@/lib/billing/plans';

export type UsageKind =
  | 'scripts_generated'
  | 'pipeline_items'
  | 'renders'
  | 'variations'
  | 'edits';

export interface DailyUsage {
  scripts_generated: number;
  pipeline_items: number;
  renders: number;
  variations: number;
  edits: number;
}

const EMPTY: DailyUsage = {
  scripts_generated: 0,
  pipeline_items: 0,
  renders: 0,
  variations: 0,
  edits: 0,
};

export interface DailyLimits {
  scripts_generated: number | null; // null = unlimited
  pipeline_items: number | null;
  renders: number | null;
  variations: number | null;
  edits: number | null;
}

/** Back-compat alias — billing plan keys are the source of truth now. */
const PAID_BILLING_PLANS = new Set<PlanKey>(['creator', 'pro', 'admin']);

export function isPaidPlan(plan: string | null | undefined): boolean {
  return PAID_BILLING_PLANS.has(resolveBillingPlan(plan));
}

/** `-1` (unlimited) in PLANS is represented as `null` in DailyLimits. */
function capFromPlan(value: number): number | null {
  return value === -1 ? null : value;
}

function limitsForPlan(planId: string): DailyLimits {
  const bucket = resolveBillingPlan(planId);
  const plan = PLANS[bucket];
  const paid = isPaidBucket(bucket);

  return {
    // Legacy free-tier caps kept as-is; paid = unlimited.
    scripts_generated: paid ? null : 10,
    pipeline_items: paid ? null : 10,
    renders: paid ? null : 3,
    // Variations + edits now sourced from PLANS.
    variations: capFromPlan(plan.variations_per_video),
    edits: capFromPlan(plan.edits_per_day),
  };
}

function isPaidBucket(bucket: PlanKey): boolean {
  return PAID_BILLING_PLANS.has(bucket);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getDailyUsage(userId: string): Promise<DailyUsage> {
  try {
    const { data, error } = await supabaseAdmin
      .from('daily_usage')
      .select('scripts_generated, pipeline_items, renders, variations, edits')
      .eq('user_id', userId)
      .eq('usage_date', today())
      .maybeSingle();
    // Fail OPEN if the table is missing or any unexpected error occurs
    // (e.g. dev env without Phase 3 migration applied).
    if (error || !data) return { ...EMPTY };
    return {
      scripts_generated: data.scripts_generated ?? 0,
      pipeline_items: data.pipeline_items ?? 0,
      renders: data.renders ?? 0,
      variations: data.variations ?? 0,
      edits: (data as { edits?: number }).edits ?? 0,
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function incrementUsage(userId: string, kind: UsageKind): Promise<void> {
  try {
    const current = await getDailyUsage(userId);
    const next = { ...current, [kind]: (current[kind] ?? 0) + 1 };
    await supabaseAdmin
      .from('daily_usage')
      .upsert(
        {
          user_id: userId,
          usage_date: today(),
          ...next,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,usage_date' },
      );
  } catch {
    // Fail open — usage tracking is best-effort; never block the user.
  }
}

export async function getUserPlan(userId: string): Promise<string> {
  return getPlan(userId);
}

async function getPlan(userId: string): Promise<string> {
  try {
    const { data } = await supabaseAdmin
      .from('user_subscriptions')
      .select('plan_id')
      .eq('user_id', userId)
      .maybeSingle();
    return data?.plan_id || 'free';
  } catch {
    return 'free';
  }
}

export interface DailyLimitCheck {
  allowed: boolean;
  limit: number | null;
  used: number;
  plan: string;
}

/**
 * Enforce the soft daily cap for a given usage kind.
 * Admins always pass.
 *
 * For the `edits` kind we add a bonus from active referral redemptions
 * (each referred user grants +3 edits to the referrer's daily cap, up
 * to a soft ceiling inside referrals lib).
 */
export async function checkDailyLimit(
  userId: string,
  isAdmin: boolean,
  kind: UsageKind,
): Promise<DailyLimitCheck> {
  if (isAdmin) {
    return { allowed: true, limit: null, used: 0, plan: 'admin' };
  }
  try {
    const [plan, usage] = await Promise.all([getPlan(userId), getDailyUsage(userId)]);
    const limits = limitsForPlan(plan);
    let limit = limits[kind];
    const used = usage[kind] ?? 0;

    // Referral bonus edits (free-tier growth loop).
    if (kind === 'edits' && limit !== null) {
      const bonus = await getReferralBonusEdits(userId).catch(() => 0);
      limit = limit + bonus;
    }

    if (limit === null) return { allowed: true, limit: null, used, plan };
    return { allowed: used < limit, limit, used, plan };
  } catch {
    // Fail open so a missing table / transient DB error never blocks a user.
    return { allowed: true, limit: null, used: 0, plan: 'unknown' };
  }
}

/**
 * Count active referral redemptions for a user and award bonus
 * daily edits. Each successful referral = +3 edits/day (no expiry for
 * the MVP). Capped at 30 (10 referrals worth) to prevent abuse.
 */
async function getReferralBonusEdits(userId: string): Promise<number> {
  try {
    const { count } = await supabaseAdmin
      .from('referral_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_user_id', userId);
    const n = count ?? 0;
    return Math.min(n * 3, 30);
  } catch {
    return 0;
  }
}
