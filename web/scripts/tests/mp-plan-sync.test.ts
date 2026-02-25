/**
 * Lightweight integration test for marketplace plan sync logic.
 *
 * Usage:  npx tsx scripts/tests/mp-plan-sync.test.ts
 *
 * Tests the pure logic (tier resolution, status mapping) without
 * hitting Stripe or Supabase.
 */

import {
  MP_PLAN_CONFIGS,
  mpTierFromStripePriceId,
  isMpStripePriceId,
  getMpPlanConfig,
  mpPlanLabel,
  type MpPlanTier,
} from "../../lib/marketplace/plan-config";

import { extractMpClientId } from "../../lib/marketplace/plan-sync";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

// ── Plan config tests ──────────────────────────────────────

console.log("\n── Plan config ──");

assert(MP_PLAN_CONFIGS.pool_15.daily_cap === 15, "pool_15 daily_cap = 15");
assert(MP_PLAN_CONFIGS.pool_15.sla_hours === 48, "pool_15 sla_hours = 48");
assert(MP_PLAN_CONFIGS.pool_15.priority_weight === 1, "pool_15 priority_weight = 1");
assert(MP_PLAN_CONFIGS.pool_15.price_usd === 1499, "pool_15 price = $1499");

assert(MP_PLAN_CONFIGS.dedicated_30.daily_cap === 30, "dedicated_30 daily_cap = 30");
assert(MP_PLAN_CONFIGS.dedicated_30.sla_hours === 24, "dedicated_30 sla_hours = 24");
assert(MP_PLAN_CONFIGS.dedicated_30.priority_weight === 2, "dedicated_30 priority_weight = 2");
assert(MP_PLAN_CONFIGS.dedicated_30.price_usd === 2499, "dedicated_30 price = $2499");

assert(MP_PLAN_CONFIGS.scale_50.daily_cap === 50, "scale_50 daily_cap = 50");
assert(MP_PLAN_CONFIGS.scale_50.sla_hours === 24, "scale_50 sla_hours = 24");
assert(MP_PLAN_CONFIGS.scale_50.priority_weight === 3, "scale_50 priority_weight = 3");
assert(MP_PLAN_CONFIGS.scale_50.price_usd === 3999, "scale_50 price = $3999");

assert(MP_PLAN_CONFIGS.custom.daily_cap === 15, "custom defaults to pool values");

// ── Label helpers ──────────────────────────────────────────

console.log("\n── Labels ──");

assert(mpPlanLabel("pool_15") === "Pool", 'pool_15 label = "Pool"');
assert(mpPlanLabel("dedicated_30") === "Dedicated", 'dedicated_30 label = "Dedicated"');
assert(mpPlanLabel("scale_50") === "Scale", 'scale_50 label = "Scale"');

// ── Config getter ──────────────────────────────────────────

console.log("\n── getMpPlanConfig ──");

const poolCfg = getMpPlanConfig("pool_15");
assert(poolCfg.daily_cap === 15, "getMpPlanConfig returns correct config");

const unknownCfg = getMpPlanConfig("custom");
assert(unknownCfg.daily_cap === 15, "custom tier falls back gracefully");

// ── Stripe price ID mapping ────────────────────────────────

console.log("\n── Stripe mapping ──");

// Since env vars aren't set in test, stripe_price_id will be null
assert(MP_PLAN_CONFIGS.pool_15.stripe_price_id === null, "pool_15 stripe_price_id is null without env");
assert(!isMpStripePriceId("price_random"), "random price ID is not marketplace");
assert(mpTierFromStripePriceId("price_random") === undefined, "unknown price returns undefined");

// Simulate setting a price ID and checking the reverse map
// (In production, env vars populate these at module load time)

// ── Metadata extraction ────────────────────────────────────

console.log("\n── Metadata extraction ──");

assert(extractMpClientId({ mp_client_id: "abc-123" }) === "abc-123", "extracts mp_client_id");
assert(extractMpClientId({ user_id: "xyz" }) === null, "returns null when no mp_client_id");
assert(extractMpClientId(null) === null, "handles null metadata");

// ── Summary ────────────────────────────────────────────────

console.log(`\n═══ ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed > 0 ? 1 : 0);
