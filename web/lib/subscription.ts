/**
 * Subscription/Plan gating for role workbenches.
 * Fail-safe: if no subscription config, default to ALLOW.
 * Admin users always bypass gating.
 *
 * Resolution order: system_setting -> env -> default
 *
 * Org-level plans:
 * - Organizations can have plans (free/pro/enterprise)
 * - Users inherit org plan if they are org members
 * - User-level plan is fallback for non-org users
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEffectiveBoolean } from "@/lib/settings";
import { getPrimaryClientOrgForUser } from "@/lib/client-org";
import { migrateOldPlanId, PLAN_RANK } from "@/lib/plans";

export type PlanType = "free" | "creator_lite" | "creator_pro" | "brand" | "agency";

/** Legacy alias — old code that checks === "pro" can use this */
export type LegacyPlanType = "free" | "pro";
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
  source: "org" | "user_event" | "env" | "default";
  plan: OrgPlanType;
  org_id?: string;
}

export interface UserPlan {
  plan: PlanType;
  isActive: boolean;
}

/**
 * Get the list of pro user IDs from environment.
 * PRO_USER_IDS is a comma-separated list of UUIDs.
 */
function getProUserIds(): Set<string> {
  const envValue = process.env.PRO_USER_IDS;
  if (!envValue || envValue.trim() === "") {
    return new Set();
  }
  return new Set(
    envValue
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter((id) => id.length > 0)
  );
}

/**
 * Check if subscription gating is enabled (sync version for backwards compat).
 * Uses env var only. For system settings support, use isSubscriptionGatingEnabledAsync.
 */
export function isSubscriptionGatingEnabledSync(): boolean {
  const explicitSetting = process.env.SUBSCRIPTION_GATING_ENABLED;

  if (explicitSetting !== undefined) {
    return explicitSetting === "true" || explicitSetting === "1";
  }

  // Default: only enable if PRO_USER_IDS is configured
  const proUserIds = getProUserIds();
  return proUserIds.size > 0;
}

/**
 * Check if subscription gating is enabled.
 * Resolution order: system_setting -> env -> default (false)
 * If SUBSCRIPTION_GATING_ENABLED is explicitly "false" or "0", gating is disabled.
 * Default: enabled if PRO_USER_IDS is set, otherwise disabled (fail-safe allow all).
 */
export async function isSubscriptionGatingEnabled(): Promise<boolean> {
  try {
    // Check system setting first (from video_events)
    const settingValue = await getEffectiveBoolean("SUBSCRIPTION_GATING_ENABLED");
    // getEffectiveBoolean returns the resolved value (system_setting -> env -> default)
    // The settings resolver handles the env fallback internally
    return settingValue;
  } catch (err) {
    // On error, fall back to sync version (env-only)
    console.error("Error fetching SUBSCRIPTION_GATING_ENABLED setting, using env fallback:", err);
    return isSubscriptionGatingEnabledSync();
  }
}

/** All valid SaaS plan IDs */
const VALID_SAAS_PLANS = new Set<PlanType>(["free", "creator_lite", "creator_pro", "brand", "agency"]);

/**
 * Normalize a plan string to a valid 5-tier PlanType.
 * Maps legacy IDs: "pro" → "creator_pro", "starter" → "creator_lite", etc.
 */
function normalizePlanId(raw: string): PlanType {
  const migrated = migrateOldPlanId(raw);
  // Legacy "pro" from events_log / env maps to creator_pro
  if (raw === "pro") return "creator_pro";
  if (VALID_SAAS_PLANS.has(migrated as PlanType)) return migrated as PlanType;
  return "free";
}

/**
 * Get the user's subscription plan.
 * Resolution order:
 * 1. user_subscriptions table (Stripe-managed, authoritative for paying users)
 * 2. events_log admin_set_plan events (admin overrides)
 * 3. PRO_USER_IDS env allowlist (legacy)
 * 4. Default: free
 *
 * Fail-safe: returns { plan: "agency", isActive: true } if gating is not enabled.
 */
export async function getUserPlan(userId: string): Promise<UserPlan> {
  // Fail-safe: if gating not enabled, everyone gets full access
  const gatingEnabled = await isSubscriptionGatingEnabled();
  if (!gatingEnabled) {
    return { plan: "agency", isActive: true };
  }

  if (!userId) {
    return { plan: "free", isActive: true };
  }

  const normalizedUserId = userId.toLowerCase();

  // 1. Check user_subscriptions table (Stripe-managed truth)
  try {
    const { data: subscription } = await supabaseAdmin
      .from("user_subscriptions")
      .select("plan_id, status")
      .eq("user_id", userId)
      .single();

    if (subscription?.plan_id && subscription.plan_id !== "free") {
      const plan = normalizePlanId(subscription.plan_id);
      const isActive = subscription.status === "active" || subscription.status === "trialing";
      if (plan !== "free") {
        return { plan, isActive };
      }
    }
  } catch (err) {
    // Table doesn't exist or no row — fall through
    console.error("Error checking user_subscriptions:", err);
  }

  // 2. Check events_log for admin_set_plan events (admin overrides)
  try {
    const { data: planEvent } = await supabaseAdmin
      .from("events_log")
      .select("payload")
      .eq("entity_type", "user")
      .eq("entity_id", normalizedUserId)
      .eq("event_type", "admin_set_plan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planEvent?.payload) {
      const payload = planEvent.payload as { plan?: string; is_active?: boolean };
      if (payload.plan) {
        const plan = normalizePlanId(payload.plan);
        return {
          plan,
          isActive: payload.is_active !== false,
        };
      }
    }
  } catch (err) {
    console.error("Error checking admin_set_plan events:", err);
  }

  // 3. Check PRO_USER_IDS env allowlist (legacy — maps to creator_pro)
  const proUserIds = getProUserIds();
  if (proUserIds.has(normalizedUserId)) {
    return { plan: "creator_pro", isActive: true };
  }

  // 4. Default: free plan
  return { plan: "free", isActive: true };
}

/**
 * Check if a user has an active paid subscription (any tier above free).
 * Fail-safe: returns true if gating is not enabled.
 */
export async function isPaidUser(userId: string): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return (PLAN_RANK[plan.plan] ?? 0) >= 1 && plan.isActive;
}

/**
 * Check if a user has an active pro subscription (creator_pro or higher).
 * Backwards compatible — treats creator_pro+ as "pro".
 * Fail-safe: returns true if gating is not enabled.
 */
export async function isProUser(userId: string): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return (PLAN_RANK[plan.plan] ?? 0) >= (PLAN_RANK["creator_pro"] ?? 2) && plan.isActive;
}

/**
 * Check if a user can perform gated actions (requires any paid plan).
 * Returns true if:
 * - User is admin (always passes)
 * - User has any paid plan (creator_lite or higher)
 * - Subscription gating is disabled (fail-safe)
 */
export async function canPerformGatedAction(
  userId: string,
  isAdmin: boolean
): Promise<{ allowed: boolean; reason?: string; plan?: PlanType }> {
  // Admins always bypass
  if (isAdmin) {
    return { allowed: true };
  }

  // Check if gating is enabled
  const gatingEnabled = await isSubscriptionGatingEnabled();
  if (!gatingEnabled) {
    return { allowed: true };
  }

  // Check user plan — any paid plan passes
  const userPlan = await getUserPlan(userId);
  const paid = (PLAN_RANK[userPlan.plan] ?? 0) >= 1 && userPlan.isActive;
  if (paid) {
    return { allowed: true, plan: userPlan.plan };
  }

  return {
    allowed: false,
    reason: "subscription_required",
    plan: userPlan.plan,
  };
}

/**
 * Get subscription gating config for debugging/admin UI.
 */
export async function getSubscriptionConfig(): Promise<{
  gatingEnabled: boolean;
  proUserCount: number;
}> {
  const gatingEnabled = await isSubscriptionGatingEnabled();
  return {
    gatingEnabled,
    proUserCount: getProUserIds().size,
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
 * 2. Check events_log admin_set_plan events (per-user)
 * 3. Check PRO_USER_IDS env allowlist
 * 4. Default to "free"
 */
export async function getEffectivePlanForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<EffectivePlan> {
  if (!userId) {
    return { source: "default", plan: "free" };
  }

  const normalizedUserId = userId.toLowerCase();

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

  // 2. Check events_log for admin_set_plan events (per-user)
  try {
    const { data: planEvent } = await supabase
      .from("events_log")
      .select("payload")
      .eq("entity_type", "user")
      .eq("entity_id", normalizedUserId)
      .eq("event_type", "admin_set_plan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planEvent?.payload) {
      const payload = planEvent.payload as { plan?: string };
      if (payload.plan) {
        // Map legacy "pro" → "pro" for org plan context (OrgPlanType)
        const orgPlan = payload.plan === "pro" || payload.plan === "creator_pro" || payload.plan === "creator_lite" || payload.plan === "brand" || payload.plan === "agency"
          ? "pro" as OrgPlanType
          : "free" as OrgPlanType;
        return { source: "user_event", plan: orgPlan };
      }
    }
  } catch (err) {
    console.error("Error checking admin_set_plan events:", err);
  }

  // 3. Check PRO_USER_IDS env allowlist
  const proUserIds = getProUserIds();
  if (proUserIds.has(normalizedUserId)) {
    return { source: "env", plan: "pro" };
  }

  // 4. Default: free plan
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
