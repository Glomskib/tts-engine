/**
 * Marketplace Plan Configuration — single source of truth.
 *
 * Maps plan tier → entitlements (caps, SLA, priority, Stripe IDs).
 * Both server routes and UI import from here; no magic numbers elsewhere.
 */

// ── Tier type ──────────────────────────────────────────────

export type MpPlanTier = "pool_15" | "dedicated_30" | "scale_50" | "custom";

export const MP_PLAN_TIERS: readonly MpPlanTier[] = [
  "pool_15",
  "dedicated_30",
  "scale_50",
  "custom",
] as const;

// ── Per-tier config ────────────────────────────────────────

export interface MpPlanConfig {
  /** Human-readable label */
  label: string;
  /** Monthly price in USD (display only — Stripe is the billing authority) */
  price_usd: number;
  /** Max scripts/videos a client can submit per calendar day */
  daily_cap: number;
  /** Target turnaround in hours */
  sla_hours: number;
  /** Queue priority — higher = dispatched first */
  priority_weight: number;
  /** Stripe price ID for this tier (set via env) */
  stripe_price_id: string | null;
}

/**
 * Canonical plan entitlements keyed by tier.
 *
 * Stripe price IDs are read from environment variables so they never
 * leak into source control.  The dry-run script verifies the mapping.
 */
export const MP_PLAN_CONFIGS: Record<MpPlanTier, MpPlanConfig> = {
  pool_15: {
    label: "Pool",
    price_usd: 1499,
    daily_cap: 15,
    sla_hours: 48,
    priority_weight: 1,
    stripe_price_id: process.env.STRIPE_PRICE_MP_POOL?.trim() || null,
  },
  dedicated_30: {
    label: "Dedicated",
    price_usd: 2499,
    daily_cap: 30,
    sla_hours: 24,
    priority_weight: 2,
    stripe_price_id: process.env.STRIPE_PRICE_MP_DEDICATED?.trim() || null,
  },
  scale_50: {
    label: "Scale",
    price_usd: 3999,
    daily_cap: 50,
    sla_hours: 24,
    priority_weight: 3,
    stripe_price_id: process.env.STRIPE_PRICE_MP_SCALE?.trim() || null,
  },
  custom: {
    label: "Custom",
    price_usd: 0,
    daily_cap: 15,
    sla_hours: 48,
    priority_weight: 1,
    stripe_price_id: null,
  },
};

// ── Stripe ↔ Tier lookup ──────────────────────────────────

/** Reverse map: Stripe price_id → tier.  Built once at module load. */
const _priceToTier = new Map<string, MpPlanTier>();
for (const [tier, cfg] of Object.entries(MP_PLAN_CONFIGS)) {
  if (cfg.stripe_price_id) {
    _priceToTier.set(cfg.stripe_price_id, tier as MpPlanTier);
  }
}

/**
 * Resolve a Stripe price ID to a marketplace plan tier.
 * Returns `undefined` if the price ID doesn't match any tier.
 */
export function mpTierFromStripePriceId(priceId: string): MpPlanTier | undefined {
  return _priceToTier.get(priceId);
}

/**
 * Check whether a Stripe price ID belongs to a marketplace plan.
 */
export function isMpStripePriceId(priceId: string): boolean {
  return _priceToTier.has(priceId);
}

// ── Helpers ────────────────────────────────────────────────

/** Get config for a tier (safe — returns pool_15 defaults for unknown tiers) */
export function getMpPlanConfig(tier: MpPlanTier): MpPlanConfig {
  return MP_PLAN_CONFIGS[tier] ?? MP_PLAN_CONFIGS.pool_15;
}

/** Get the human-readable label for a tier */
export function mpPlanLabel(tier: MpPlanTier): string {
  return MP_PLAN_CONFIGS[tier]?.label ?? "Pool";
}

// ── Plan status ────────────────────────────────────────────

export type MpPlanStatus = "active" | "past_due" | "canceled" | "trialing";
