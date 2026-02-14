/**
 * Subscription/Plan gating.
 * Reads from user_subscriptions table (Stripe-managed, authoritative).
 * Admin users always bypass gating.
 *
 * Org-level plans:
 * - Organizations can have plans (free/pro/enterprise)
 * - Users inherit org plan if they are org members
 * - User-level plan is fallback for non-org users
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPrimaryClientOrgForUser } from "@/lib/client-org";
import { migrateOldPlanId, PLAN_RANK, meetsMinPlan } from "@/lib/plans";

export type PlanType = "free" | "creator_lite" | "creator_pro" | "brand" | "agency";

export type OrgPlanType = "free" | "pro" | "enterprise";
export type OrgBillingStatus = "active" | "trial" | "past_due" | "canceled";

// Event type constants for org plans
export const ORG_PLAN_EVENT_TYPES = {
  ORG_SET_PLAN: "client_org_set_plan",
  ORG_BILLING_STATUS_SET: "client_org_billing_status_set",
} as const;

export interface OrgPlanInfo {
  plan: OrgPlanType;
  billing_status: OrgBillingStatus;
}

export interface EffectivePlan {
  source: "org" | "user_subscription" | "default";
  plan: OrgPlanType;
  org_id?: string;
}

export interface UserPlan {
  plan: PlanType;
  isActive: boolean;
}

/** All valid SaaS plan IDs */
const VALID_SAAS_PLANS = new Set<PlanType>(["free", "creator_lite", "creator_pro", "brand", "agency"]);

/**
 * Normalize a plan string to a valid 5-tier PlanType.
 * Maps legacy IDs: "pro" → "creator_pro", "starter" → "creator_lite", etc.
 */
function normalizePlanId(raw: string): PlanType {
  if (raw === "pro") return "creator_pro";
  const migrated = migrateOldPlanId(raw);
  if (VALID_SAAS_PLANS.has(migrated as PlanType)) return migrated as PlanType;
  return "free";
}

/**
 * Get the user's subscription plan from user_subscriptions table.
 * This is the single source of truth for user plans.
 * Stripe webhook and admin set-plan both write here.
 */
export async function getUserPlan(userId: string): Promise<UserPlan> {
  if (!userId) {
    return { plan: "free", isActive: true };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("user_subscriptions")
      .select("plan_id, status")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return { plan: "free", isActive: true };
    }

    const plan = normalizePlanId(data.plan_id || "free");
    const isActive = ["active", "trialing", "past_due"].includes(data.status);

    if (plan !== "free" && isActive) {
      return { plan, isActive: true };
    }

    return { plan: "free", isActive: true };
  } catch (err) {
    console.error("Error fetching user plan from user_subscriptions:", err);
    return { plan: "free", isActive: true };
  }
}

/**
 * Check if a user has an active paid subscription (any tier above free).
 */
export async function isPaidUser(userId: string): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return (PLAN_RANK[plan.plan] ?? 0) >= 1 && plan.isActive;
}

/**
 * Check if a user's plan meets or exceeds a minimum required plan.
 */
export async function userMeetsMinPlan(userId: string, minPlan: string): Promise<boolean> {
  const userPlan = await getUserPlan(userId);
  return meetsMinPlan(userPlan.plan, minPlan);
}

/**
 * Check if a user can perform gated actions.
 * Returns true if:
 * - User is admin (always passes)
 * - User's plan meets the minimum required plan
 */
export async function canPerformGatedAction(
  userId: string,
  isAdmin: boolean,
  minPlan: string = "creator_lite"
): Promise<{ allowed: boolean; reason?: string; plan?: PlanType }> {
  // Admins always bypass
  if (isAdmin) {
    return { allowed: true };
  }

  const userPlan = await getUserPlan(userId);
  const userRank = PLAN_RANK[userPlan.plan] ?? 0;
  const requiredRank = PLAN_RANK[minPlan] ?? 0;

  if (userRank >= requiredRank) {
    return { allowed: true, plan: userPlan.plan };
  }

  return {
    allowed: false,
    reason: "subscription_required",
    plan: userPlan.plan,
  };
}

// ============================================================================
// Org-Level Plan Functions
// ============================================================================

/**
 * Get the plan for an organization.
 * Reads from events_log for org plan events (most recent wins).
 * Defaults to "free" if no plan event exists.
 */
export async function getOrgPlan(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgPlanInfo> {
  try {
    // Get most recent plan event for this org from events_log
    const { data: planEvent } = await supabase
      .from("events_log")
      .select("payload")
      .eq("entity_type", "client_org")
      .eq("entity_id", orgId)
      .eq("event_type", ORG_PLAN_EVENT_TYPES.ORG_SET_PLAN)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let plan: OrgPlanType = "free";
    if (planEvent?.payload) {
      const payload = planEvent.payload as Record<string, unknown>;
      const eventPlan = payload?.plan;
      if (eventPlan === "free" || eventPlan === "pro" || eventPlan === "enterprise") {
        plan = eventPlan;
      }
    }

    // Get most recent billing status event for this org from events_log
    const { data: billingEvent } = await supabase
      .from("events_log")
      .select("payload")
      .eq("entity_type", "client_org")
      .eq("entity_id", orgId)
      .eq("event_type", ORG_PLAN_EVENT_TYPES.ORG_BILLING_STATUS_SET)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let billing_status: OrgBillingStatus = "active";
    if (billingEvent?.payload) {
      const payload = billingEvent.payload as Record<string, unknown>;
      const eventStatus = payload?.billing_status;
      if (["active", "trial", "past_due", "canceled"].includes(eventStatus as string)) {
        billing_status = eventStatus as OrgBillingStatus;
      }
    }

    return { plan, billing_status };
  } catch (err) {
    console.error("Error fetching org plan:", err);
    return { plan: "free", billing_status: "active" };
  }
}

/**
 * Check if a plan is a paid plan (pro or enterprise).
 */
export function isPaidOrgPlan(plan: OrgPlanType): boolean {
  return plan === "pro" || plan === "enterprise";
}

/**
 * Get the effective plan for a user.
 * Resolution order:
 * 1. If user is member of a client org, use org plan
 * 2. Check user_subscriptions table
 * 3. Default to "free"
 */
export async function getEffectivePlanForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<EffectivePlan> {
  if (!userId) {
    return { source: "default", plan: "free" };
  }

  // 1. Check if user is member of a client org
  try {
    const membership = await getPrimaryClientOrgForUser(supabase, userId);
    if (membership) {
      const orgPlanInfo = await getOrgPlan(supabase, membership.org_id);
      return {
        source: "org",
        plan: orgPlanInfo.plan,
        org_id: membership.org_id,
      };
    }
  } catch (err) {
    console.error("Error checking user org membership for plan:", err);
  }

  // 2. Check user_subscriptions table
  const userPlan = await getUserPlan(userId);
  if (userPlan.plan !== "free" && userPlan.isActive) {
    // Map SaaS plan to org plan context
    return { source: "user_subscription", plan: "pro" };
  }

  // 3. Default: free plan
  return { source: "default", plan: "free" };
}

/**
 * Check if a user's org has a paid plan.
 * Returns false if user is not in an org or org has free plan.
 */
export async function isUserOrgPaid(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const effectivePlan = await getEffectivePlanForUser(supabase, userId);
  if (effectivePlan.source === "org") {
    return isPaidOrgPlan(effectivePlan.plan);
  }
  return false;
}
