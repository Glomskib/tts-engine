/**
 * Webhook reliability hardening — unit tests for pure functions.
 *
 * Usage:  npx tsx scripts/tests/webhook-reliability.test.ts
 *
 * Tests pure helper functions without DB or Stripe calls.
 */

import { extractMpClientId, extractPriceId } from "../../lib/marketplace/plan-sync";
import {
  mpTierFromStripePriceId,
  isMpStripePriceId,
} from "../../lib/marketplace/plan-config";
import { sanitizeWebhookError } from "../../app/api/webhooks/stripe/route";

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

// ── extractMpClientId ────────────────────────────────────────

console.log("\n── extractMpClientId ──");

assert(
  extractMpClientId({ mp_client_id: "client-abc" }) === "client-abc",
  "extracts mp_client_id from metadata"
);
assert(
  extractMpClientId({ user_id: "uid-123" }) === null,
  "returns null when mp_client_id missing"
);
assert(
  extractMpClientId(null) === null,
  "handles null metadata"
);
assert(
  extractMpClientId({} as Record<string, string>) === null,
  "handles empty metadata"
);

// ── extractPriceId ───────────────────────────────────────────

console.log("\n── extractPriceId ──");

assert(
  extractPriceId({ data: [{ price: { id: "price_123" } }] }) === "price_123",
  "extracts price from items array"
);
assert(
  extractPriceId({ data: [] }) === null,
  "returns null for empty items array"
);
assert(
  extractPriceId(undefined) === null,
  "returns null for undefined items"
);
assert(
  extractPriceId({ data: [{ price: undefined }] }) === null,
  "returns null when price object is undefined"
);
assert(
  extractPriceId({ data: [{}] }) === null,
  "returns null when item has no price"
);

// ── mpTierFromStripePriceId ──────────────────────────────────

console.log("\n── mpTierFromStripePriceId ──");

assert(
  mpTierFromStripePriceId("price_nonexistent") === undefined,
  "unknown price returns undefined"
);
assert(
  mpTierFromStripePriceId("") === undefined,
  "empty string returns undefined"
);

// ── isMpStripePriceId ────────────────────────────────────────

console.log("\n── isMpStripePriceId ──");

assert(
  isMpStripePriceId("price_random_unknown") === false,
  "unknown price returns false"
);
assert(
  isMpStripePriceId("") === false,
  "empty string returns false"
);

// ── sanitizeWebhookError ─────────────────────────────────────

console.log("\n── sanitizeWebhookError ──");

// Standard Error
const stdErr = new Error("Something failed");
const stdResult = sanitizeWebhookError(stdErr);
assert(stdResult.message === "Something failed", "preserves normal error message");
assert(stdResult.type === undefined, "no type for standard Error");

// Error containing sk_live_ secret
const secretErr = new Error("Invalid API key: sk_live_abc123def456");
const secretResult = sanitizeWebhookError(secretErr);
assert(
  !secretResult.message.includes("sk_live_"),
  "strips sk_live_ from error message"
);
assert(
  secretResult.message.includes("[REDACTED]"),
  "replaces sk_live_ with [REDACTED]"
);

// Error containing sk_test_ secret
const testKeyErr = new Error("Auth failed with sk_test_xyz789");
const testKeyResult = sanitizeWebhookError(testKeyErr);
assert(
  !testKeyResult.message.includes("sk_test_"),
  "strips sk_test_ from error message"
);

// Error containing whsec_ secret
const whsecErr = new Error("Signature mismatch for whsec_abcdefg");
const whsecResult = sanitizeWebhookError(whsecErr);
assert(
  !whsecResult.message.includes("whsec_"),
  "strips whsec_ from error message"
);

// String error
const strResult = sanitizeWebhookError("raw string error with sk_live_leaked");
assert(
  !strResult.message.includes("sk_live_"),
  "strips secrets from string errors"
);

// Unknown error
const unknownResult = sanitizeWebhookError(42);
assert(unknownResult.message === "Unknown error", "handles non-Error non-string");

// Stripe-like error with type
const stripeErr = Object.assign(new Error("card_declined"), { type: "StripeCardError" });
const stripeResult = sanitizeWebhookError(stripeErr);
assert(stripeResult.type === "StripeCardError", "extracts Stripe error type");
assert(stripeResult.message === "card_declined", "preserves Stripe error message");

// Multiple secrets in one message
const multiErr = new Error("keys: sk_live_aaa and sk_test_bbb and whsec_ccc");
const multiResult = sanitizeWebhookError(multiErr);
assert(
  !multiResult.message.includes("sk_live_") &&
    !multiResult.message.includes("sk_test_") &&
    !multiResult.message.includes("whsec_"),
  "strips multiple secrets from one message"
);

// ── Signature verification behavior (documentation) ──────────

console.log("\n── Signature verification (documented behavior) ──");
console.log("  ℹ constructEvent() returns 400 on bad/missing signature — tested via integration");

// ── markEventProcessed / isEventProcessed (documentation) ────

console.log("\n── Idempotency (documented behavior) ──");
console.log("  ℹ markEventProcessed/isEventProcessed require Supabase — tested via integration flow");

// ── Summary ──────────────────────────────────────────────────

console.log(`\n═══ ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed > 0 ? 1 : 0);
