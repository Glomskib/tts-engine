/**
 * @module entitlements
 *
 * Helpers for the ff_entitlements table — the single source of truth
 * for "does this user have an active paid plan?"
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Map legacy plan_id (user_subscriptions) → short entitlement name */
export const PLAN_ID_TO_ENTITLEMENT: Record<string, string> = {
  free: "free",
  creator_lite: "lite",
  creator_pro: "pro",
  business: "business",
  brand: "brand",
  agency: "agency",
};

export interface EntitlementRow {
  user_id: string;
  plan: string;
  status: string;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertEntitlementData {
  plan?: string;
  status?: string;
  current_period_end?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
}

/**
 * Upsert a user's entitlement row. Used by Stripe webhook handlers.
 * Non-fatal — logs errors but never throws.
 */
export async function upsertEntitlement(
  userId: string,
  data: UpsertEntitlementData,
  correlationId?: string
): Promise<void> {
  const tag = correlationId ? `[${correlationId}]` : "[entitlements]";

  const { error } = await supabaseAdmin.from("ff_entitlements").upsert(
    {
      user_id: userId,
      ...data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error(`${tag} Failed to upsert ff_entitlements for ${userId}:`, error);
  }
}

/**
 * Read a user's entitlement row. Returns null if not found.
 */
export async function getEntitlement(
  userId: string
): Promise<EntitlementRow | null> {
  const { data, error } = await supabaseAdmin
    .from("ff_entitlements")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) {
    console.error(`[entitlements] Failed to read entitlement for ${userId}:`, error);
    return null;
  }

  return data as EntitlementRow;
}
