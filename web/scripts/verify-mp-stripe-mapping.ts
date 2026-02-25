#!/usr/bin/env npx tsx
/**
 * Dry-run: verify marketplace Stripe price_id ↔ tier mapping.
 *
 * Usage:  npx tsx scripts/verify-mp-stripe-mapping.ts
 *
 * Does NOT print secrets — only confirms which env vars are set
 * and whether they map to a valid tier.
 */

import {
  MP_PLAN_CONFIGS,
  mpTierFromStripePriceId,
  type MpPlanTier,
} from "../lib/marketplace/plan-config";

const ENV_KEYS: Record<MpPlanTier, string> = {
  pool_15: "STRIPE_PRICE_MP_POOL",
  dedicated_30: "STRIPE_PRICE_MP_DEDICATED",
  scale_50: "STRIPE_PRICE_MP_SCALE",
  custom: "(none — custom tier has no Stripe product)",
};

console.log("=== Marketplace Stripe Mapping Verification ===\n");

let allGood = true;

for (const [tier, cfg] of Object.entries(MP_PLAN_CONFIGS) as [MpPlanTier, typeof MP_PLAN_CONFIGS[MpPlanTier]][]) {
  const envKey = ENV_KEYS[tier];
  const hasId = !!cfg.stripe_price_id;
  const prefix = hasId ? cfg.stripe_price_id!.slice(0, 10) + "..." : "(not set)";

  // Reverse lookup sanity check
  const reverseTier = hasId ? mpTierFromStripePriceId(cfg.stripe_price_id!) : undefined;
  const reverseOk = !hasId || reverseTier === tier;

  const status = tier === "custom"
    ? "SKIP"
    : hasId && reverseOk
      ? "OK"
      : hasId && !reverseOk
        ? "MISMATCH"
        : "MISSING";

  if (status === "MISSING" || status === "MISMATCH") allGood = false;

  console.log(
    `  ${status.padEnd(8)} ${tier.padEnd(14)} env=${envKey.padEnd(30)} id=${prefix.padEnd(16)} ` +
    `cap=${String(cfg.daily_cap).padEnd(3)} sla=${String(cfg.sla_hours).padEnd(3)}h weight=${cfg.priority_weight}`
  );
}

console.log("");

if (allGood) {
  console.log("All marketplace tiers are correctly mapped.");
} else {
  console.log(
    "WARNING: Some tiers are missing Stripe price IDs.\n" +
    "Set the env vars above in .env.local (dev) or Vercel (prod).\n" +
    "Webhook will still work — unmatched price IDs fall through to SaaS handling."
  );
}

process.exit(allGood ? 0 : 1);
