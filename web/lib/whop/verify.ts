/**
 * @module whop/verify
 *
 * Signature verification + idempotency for Whop webhooks.
 *
 * Whop signs the raw request body with HMAC-SHA256 using the webhook secret
 * from the dashboard and delivers it in the `X-Whop-Signature` header. We
 * accept two common header formats:
 *   1. `<hex>`            — bare hex digest
 *   2. `v1=<hex>`         — prefixed (Stripe-style)
 *   3. `t=<ts>,v1=<hex>`  — timestamped Stripe-style
 *
 * Signed payload always uses the *raw* body. Do not JSON-parse before
 * verification — stringify round-trips can change whitespace and break the
 * signature.
 */

import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

/**
 * Verify a Whop webhook signature. Timing-safe comparison.
 * Returns `{ ok: true }` on success, `{ ok: false, reason }` on any failure.
 */
export function verifyWhopSignature(rawBody: string, signatureHeader: string | null, secret: string): VerifyResult {
  if (!signatureHeader) return { ok: false, reason: "missing signature header" };
  if (!secret)          return { ok: false, reason: "missing webhook secret" };

  const candidate = extractHexSignature(signatureHeader);
  if (!candidate) return { ok: false, reason: "unparseable signature format" };

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  // Lengths must match before timingSafeEqual or it throws.
  if (candidate.length !== expected.length) {
    return { ok: false, reason: "signature length mismatch" };
  }

  const match = crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(expected, "hex"));
  return match ? { ok: true } : { ok: false, reason: "signature mismatch" };
}

/** Pull the hex digest out of any of the supported header formats. */
function extractHexSignature(header: string): string | null {
  const trimmed = header.trim();
  // Bare hex
  if (/^[a-f0-9]+$/i.test(trimmed)) return trimmed.toLowerCase();

  // Comma-separated key=value pairs (Stripe-style)
  const parts = trimmed.split(",").map((p) => p.trim());
  for (const part of parts) {
    const [key, value] = part.split("=").map((s) => s.trim());
    if ((key === "v1" || key === "sha256") && value && /^[a-f0-9]+$/i.test(value)) {
      return value.toLowerCase();
    }
  }
  return null;
}

// ── Idempotency ────────────────────────────────────────────

export async function isWhopEventProcessed(eventId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("whop_webhook_events")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();
  return !!data;
}

export async function markWhopEventProcessed(eventId: string, eventType: string): Promise<void> {
  await supabaseAdmin.from("whop_webhook_events").upsert(
    { event_id: eventId, event_type: eventType, processed_at: new Date().toISOString() },
    { onConflict: "event_id" }
  );
}
