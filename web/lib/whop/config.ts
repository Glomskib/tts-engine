/**
 * @module whop/config
 *
 * Maps Whop products → FlashFlow plans. Product IDs are read from env vars
 * at import time so deploys can swap them without code changes. Each entry
 * writes to both:
 *   - `user_subscriptions.plan_id` (legacy plan table read by getVEPlan)
 *   - `ff_entitlements.plan`       (new single source of truth)
 *
 * The mapping is keyed by Whop product ID. If a webhook arrives for an
 * unknown product we log and skip rather than defaulting — silent
 * downgrades are worse than a visible miss.
 */

export type FfEntitlementPlan = "free" | "starter" | "lite" | "pro" | "business" | "brand" | "agency";
export type LegacyPlanId =
  | "free"
  | "creator_lite"
  | "creator_pro"
  | "business"
  | "brand"
  | "agency";

export interface WhopPlanMapping {
  /** Written to user_subscriptions.plan_id. Must match PLAN_DETAILS keys. */
  legacyPlanId: LegacyPlanId;
  /** Written to ff_entitlements.plan. */
  entitlementPlan: FfEntitlementPlan;
  /** Human label for logs / telegram. */
  label: string;
}

interface RawEntry {
  envKey: string;
  legacyPlanId: LegacyPlanId;
  entitlementPlan: FfEntitlementPlan;
  label: string;
}

/**
 * Define the product→plan table in one place. Each env var holds the Whop
 * product (plan) ID (e.g. `prod_XXX`) for that tier.
 */
const ENTRIES: RawEntry[] = [
  { envKey: "WHOP_PRODUCT_FF_STARTER", legacyPlanId: "creator_lite", entitlementPlan: "starter", label: "FlashFlow Starter" },
  { envKey: "WHOP_PRODUCT_FF_CREATOR", legacyPlanId: "creator_lite", entitlementPlan: "lite",    label: "FlashFlow Creator" },
  { envKey: "WHOP_PRODUCT_FF_PRO",     legacyPlanId: "creator_pro",  entitlementPlan: "pro",     label: "FlashFlow Pro" },
  { envKey: "WHOP_PRODUCT_FF_AGENCY",  legacyPlanId: "agency",       entitlementPlan: "agency",  label: "FlashFlow Agency" },
];

/** Resolve the product→plan map from env at call time (not module load) so
 *  tests can stub process.env without re-importing. */
export function getWhopPlanMap(): Record<string, WhopPlanMapping> {
  const out: Record<string, WhopPlanMapping> = {};
  for (const e of ENTRIES) {
    const productId = process.env[e.envKey];
    if (!productId) continue;
    out[productId] = {
      legacyPlanId: e.legacyPlanId,
      entitlementPlan: e.entitlementPlan,
      label: e.label,
    };
  }
  return out;
}

export function mapWhopProductToPlan(productId: string | null | undefined): WhopPlanMapping | null {
  if (!productId) return null;
  const map = getWhopPlanMap();
  return map[productId] ?? null;
}

/** The "canceled" plan that a deactivated membership falls back to. */
export const DEACTIVATED_PLAN: WhopPlanMapping = {
  legacyPlanId: "free",
  entitlementPlan: "free",
  label: "Free (deactivated)",
};

export interface WhopEnv {
  apiKey: string | null;
  webhookSecret: string | null;
  clientId: string | null;
  clientSecret: string | null;
  oauthRedirectUrl: string | null;
}

export function getWhopEnv(): WhopEnv {
  return {
    apiKey:          process.env.WHOP_API_KEY          ?? null,
    webhookSecret:   process.env.WHOP_WEBHOOK_SECRET   ?? null,
    clientId:        process.env.WHOP_CLIENT_ID        ?? null,
    clientSecret:    process.env.WHOP_CLIENT_SECRET    ?? null,
    oauthRedirectUrl: process.env.WHOP_OAUTH_REDIRECT_URL ?? null,
  };
}
