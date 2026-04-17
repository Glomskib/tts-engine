/**
 * Video Engine plan limits & watermark policy.
 *
 * Single source of truth for "what is this user allowed to do per upload?".
 * Output-based pricing (uploads/clips/length), not feature-based.
 *
 * Pricing — set 2026-04-16:
 *   payg         $5/upload     3 clips    5 min   watermark   basic styles
 *   ve_starter   $19/mo  10x   3 clips    5 min   watermark   basic styles
 *   ve_creator   $49/mo  40x   6 clips   15 min   no mark     all styles  + regeneration
 *   ve_pro       $99/mo 120x   8 clips   30 min   no mark     all styles  + priority render
 */
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type VEPlanId = 'payg' | 've_starter' | 've_creator' | 've_pro';

export interface VEPlanLimits {
  planId: VEPlanId;
  /** "Display" name. */
  name: string;
  /** Per-month upload cap. -1 = effectively unlimited. PAYG = -1 (gated by per-upload payment). */
  uploadsPerMonth: number;
  /** Hard cap on `target_clip_count` for a single run. */
  maxClipsPerRun: number;
  /** Hard cap on source video length in seconds. */
  maxSourceSec: number;
  /** Burn "Made with FlashFlow" overlay into every rendered clip. */
  watermark: boolean;
  /** Allowed template keys. null = all (no filter). */
  allowedTemplateKeys: string[] | null;
  /** Allowed regenerations per rendered clip. -1 = unlimited. */
  regenerationsPerClip: number;
  /** ff_render_jobs.priority — lower is dequeued first. Pro gets a head start. */
  renderPriority: number;
  /** Stripe price_id for this plan (env-driven). Null for PAYG (separate one-shot checkout). */
  stripePriceIdEnv: string | null;
}

/**
 * "Basic" styles available to PAYG / Starter. Conservative set that still
 * delivers value but reserves the punchier templates for paid tiers.
 */
const BASIC_TEMPLATE_KEYS = [
  // Affiliate basic set
  'aff_talking_head',
  'aff_ugc_review',
  // Nonprofit basic set
  'np_event_recap',
  'np_join_us',
];

export const VE_LIMITS_BY_PLAN: Record<VEPlanId, VEPlanLimits> = {
  payg: {
    planId: 'payg',
    name: 'Pay-as-you-go',
    uploadsPerMonth: -1,           // gated by per-upload Stripe charge, not monthly cap
    maxClipsPerRun: 3,
    maxSourceSec: 5 * 60,
    watermark: true,
    allowedTemplateKeys: BASIC_TEMPLATE_KEYS,
    regenerationsPerClip: 1,
    renderPriority: 200,
    stripePriceIdEnv: null,        // one-shot price set in PAYG checkout route
  },
  ve_starter: {
    planId: 've_starter',
    name: 'Starter',
    uploadsPerMonth: 10,
    maxClipsPerRun: 3,
    maxSourceSec: 5 * 60,
    watermark: true,
    allowedTemplateKeys: BASIC_TEMPLATE_KEYS,
    regenerationsPerClip: 1,
    renderPriority: 150,
    stripePriceIdEnv: 'STRIPE_PRICE_VE_STARTER',
  },
  ve_creator: {
    planId: 've_creator',
    name: 'Creator',
    uploadsPerMonth: 40,
    maxClipsPerRun: 6,
    maxSourceSec: 15 * 60,
    watermark: false,
    allowedTemplateKeys: null,     // all
    regenerationsPerClip: -1,
    renderPriority: 100,
    stripePriceIdEnv: 'STRIPE_PRICE_VE_CREATOR',
  },
  ve_pro: {
    planId: 've_pro',
    name: 'Pro',
    uploadsPerMonth: 120,
    maxClipsPerRun: 8,
    maxSourceSec: 30 * 60,
    watermark: false,
    allowedTemplateKeys: null,
    regenerationsPerClip: -1,
    renderPriority: 50,            // priority queue
    stripePriceIdEnv: 'STRIPE_PRICE_VE_PRO',
  },
};

/**
 * Map any user-subscriptions plan_id to a VE plan tier. Legacy unlimited plans
 * (creator_pro, business, brand, agency) map to ve_pro. Unknown / no plan → payg.
 */
export function resolveVEPlan(planId: string | null | undefined): VEPlanLimits {
  const id = (planId ?? '').toLowerCase();
  if (id === 've_starter') return VE_LIMITS_BY_PLAN.ve_starter;
  if (id === 've_creator') return VE_LIMITS_BY_PLAN.ve_creator;
  if (id === 've_pro')     return VE_LIMITS_BY_PLAN.ve_pro;
  // Legacy paid tiers — treat as Pro-equivalent for VE.
  if (id === 'creator_pro' || id === 'business' || id === 'brand' || id === 'agency') {
    return VE_LIMITS_BY_PLAN.ve_pro;
  }
  return VE_LIMITS_BY_PLAN.payg;
}

/**
 * Look up the active VE plan for a user. Admins always get ve_pro.
 * Falls back to payg if no active subscription is found.
 */
export async function getVEPlan(userId: string): Promise<VEPlanLimits> {
  // Admin bypass
  const { data: roleRow } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  if (roleRow?.role === 'admin') return VE_LIMITS_BY_PLAN.ve_pro;

  const { data: sub } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id, status')
    .eq('user_id', userId)
    .maybeSingle();

  if (!sub || (sub.status && !['active', 'trialing'].includes(sub.status))) {
    return VE_LIMITS_BY_PLAN.payg;
  }
  return resolveVEPlan(sub.plan_id);
}

export interface VEUsageCheck {
  allowed: boolean;
  reason?: string;
  upgradeTo?: VEPlanId;
  upgradeMessage?: string;
}

/**
 * Decide whether a new run is allowed for this user given monthly upload caps.
 * Counts ve_runs created in the last 30 days. PAYG always returns allowed=true
 * (per-upload billing handled at the checkout layer).
 */
export async function checkUploadAllowed(
  userId: string,
  plan: VEPlanLimits,
): Promise<VEUsageCheck> {
  if (plan.uploadsPerMonth === -1) return { allowed: true };

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from('ve_runs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);

  const used = count ?? 0;
  if (used >= plan.uploadsPerMonth) {
    const upgradeTo: VEPlanId =
      plan.planId === 've_starter' ? 've_creator' :
      plan.planId === 've_creator' ? 've_pro' : 've_creator';
    return {
      allowed: false,
      reason: 'monthly_upload_cap',
      upgradeTo,
      upgradeMessage: `You've used all ${plan.uploadsPerMonth} uploads on the ${plan.name} plan this month. Upgrade to ${VE_LIMITS_BY_PLAN[upgradeTo].name} for ${VE_LIMITS_BY_PLAN[upgradeTo].uploadsPerMonth} uploads/mo.`,
    };
  }
  return { allowed: true };
}

/**
 * Filter a requested template-key list down to what this plan actually allows.
 * Returns the filtered list and a flag indicating whether anything was removed
 * (so the UI can surface an upgrade nudge for "Unlock all styles").
 */
export function filterTemplatesByPlan(
  requested: string[],
  plan: VEPlanLimits,
): { allowed: string[]; removed: string[] } {
  if (plan.allowedTemplateKeys === null) {
    return { allowed: requested, removed: [] };
  }
  const allow = new Set(plan.allowedTemplateKeys);
  const allowed = requested.filter((k) => allow.has(k));
  const removed = requested.filter((k) => !allow.has(k));
  return { allowed, removed };
}

export const WATERMARK_TEXT = 'Made with FlashFlow';
