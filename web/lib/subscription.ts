/**
 * Subscription/Plan gating for role workbenches.
 * Fail-safe: if no subscription config, default to ALLOW.
 * Admin users always bypass gating.
 *
 * Resolution order: system_setting -> env -> default
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEffectiveBoolean } from "@/lib/settings";

export type PlanType = "free" | "pro";

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

/**
 * Get the user's subscription plan.
 * Checks (in order):
 * 1. video_events admin_set_plan events (most recent wins)
 * 2. PRO_USER_IDS env allowlist
 *
 * Fail-safe: returns { plan: "pro", isActive: true } if gating is not enabled.
 */
export async function getUserPlan(userId: string): Promise<UserPlan> {
  // Fail-safe: if gating not enabled, everyone is pro
  const gatingEnabled = await isSubscriptionGatingEnabled();
  if (!gatingEnabled) {
    return { plan: "pro", isActive: true };
  }

  if (!userId) {
    return { plan: "free", isActive: true };
  }

  const normalizedUserId = userId.toLowerCase();

  // Check video_events for admin_set_plan events (most recent first)
  try {
    const { data: planEvent } = await supabaseAdmin
      .from("video_events")
      .select("details")
      .eq("event_type", "admin_set_plan")
      .eq("actor", normalizedUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planEvent?.details) {
      const details = planEvent.details as { plan?: PlanType; is_active?: boolean };
      if (details.plan === "pro" || details.plan === "free") {
        return {
          plan: details.plan,
          isActive: details.is_active !== false,
        };
      }
    }
  } catch (err) {
    // Table doesn't exist or error, fall through to env check
    console.error("Error checking admin_set_plan events:", err);
  }

  // Check PRO_USER_IDS env allowlist
  const proUserIds = getProUserIds();
  if (proUserIds.has(normalizedUserId)) {
    return { plan: "pro", isActive: true };
  }

  // Default: free plan
  return { plan: "free", isActive: true };
}

/**
 * Check if a user has an active pro subscription.
 * Fail-safe: returns true if gating is not enabled.
 */
export async function isProUser(userId: string): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return plan.plan === "pro" && plan.isActive;
}

/**
 * Check if a user can perform gated actions.
 * Returns true if:
 * - User is admin (always passes)
 * - User has pro plan
 * - Subscription gating is disabled (fail-safe)
 */
export async function canPerformGatedAction(
  userId: string,
  isAdmin: boolean
): Promise<{ allowed: boolean; reason?: string }> {
  // Admins always bypass
  if (isAdmin) {
    return { allowed: true };
  }

  // Check if gating is enabled
  const gatingEnabled = await isSubscriptionGatingEnabled();
  if (!gatingEnabled) {
    return { allowed: true };
  }

  // Check user plan
  const isPro = await isProUser(userId);
  if (isPro) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "subscription_required",
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
