/**
 * POST /api/webhooks/whop
 *
 * Receives signed webhooks from Whop (https://dev.whop.com/webhooks) and
 * syncs the user's plan into user_subscriptions + ff_entitlements.
 *
 * Handles: membership.activated, membership.deactivated, payment.succeeded.
 * Older Whop event names (membership.went_valid / membership.went_invalid /
 * payment_succeeded) are accepted as aliases so existing dashboards keep
 * working.
 *
 * Setup:
 *   1. Set WHOP_WEBHOOK_SECRET from the Whop dashboard.
 *   2. Point a webhook at https://<your-domain>/api/webhooks/whop.
 *   3. Set WHOP_PRODUCT_FF_CREATOR / _FF_PRO / _FF_AGENCY to the Whop
 *      product (plan) IDs that map to each FlashFlow tier.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateCorrelationId } from "@/lib/api-errors";
import { getWhopEnv } from "@/lib/whop/config";
import {
  verifyWhopSignature,
  isWhopEventProcessed,
  markWhopEventProcessed,
} from "@/lib/whop/verify";
import {
  handleMembershipActivated,
  handleMembershipDeactivated,
  handlePaymentSucceeded,
  type WhopMembershipEvent,
  type WhopPaymentEvent,
} from "@/lib/whop/sync";

export const runtime = "nodejs";

// Accept the canonical names the user asked for plus the older Whop event
// names so either dashboard setting works out of the box.
const ACTIVATED_EVENTS   = new Set(["membership.activated", "membership.went_valid"]);
const DEACTIVATED_EVENTS = new Set(["membership.deactivated", "membership.went_invalid", "membership.expired"]);
const PAYMENT_EVENTS     = new Set(["payment.succeeded", "payment_succeeded"]);

interface WhopEventEnvelope {
  /** Event ID — preferred. Older payloads put this on `data.id` of the event itself. */
  id?: string;
  /** Event type, e.g. "membership.activated". */
  action?: string;
  event?: string;
  type?: string;
  /** The entity (membership / payment) that triggered the event. */
  data?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const env = getWhopEnv();

  if (!env.webhookSecret) {
    console.error(`[${correlationId}] whop/webhook: WHOP_WEBHOOK_SECRET not set`);
    return NextResponse.json({ error: "webhook not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature =
    request.headers.get("x-whop-signature") ??
    request.headers.get("whop-signature") ??
    request.headers.get("x-whop-webhook-signature");

  const verify = verifyWhopSignature(rawBody, signature, env.webhookSecret);
  if (!verify.ok) {
    console.warn(`[${correlationId}] whop/webhook: signature rejected (${verify.reason})`);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let envelope: WhopEventEnvelope;
  try {
    envelope = JSON.parse(rawBody) as WhopEventEnvelope;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const eventType = envelope.action ?? envelope.event ?? envelope.type ?? "";
  const eventId = envelope.id ?? `whop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  if (await isWhopEventProcessed(eventId)) {
    console.info(`[${correlationId}] whop/webhook: duplicate ${eventId}, skipping`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  const data = (envelope.data ?? {}) as Record<string, unknown>;
  console.info(`[${correlationId}] whop/webhook: ${eventType} (${eventId})`);

  try {
    if (ACTIVATED_EVENTS.has(eventType)) {
      await handleMembershipActivated(normalizeMembership(data), correlationId);
    } else if (DEACTIVATED_EVENTS.has(eventType)) {
      await handleMembershipDeactivated(normalizeMembership(data), correlationId);
    } else if (PAYMENT_EVENTS.has(eventType)) {
      await handlePaymentSucceeded(normalizePayment(data), correlationId);
    } else {
      console.info(`[${correlationId}] whop/webhook: unhandled event type ${eventType}`);
    }

    await markWhopEventProcessed(eventId, eventType);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[${correlationId}] whop/webhook: handler threw:`, err);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}

// ── Payload normalization ─────────────────────────────────
// Whop has shipped a few payload shapes over time. We read the fields we
// care about from whichever key is populated and fall through gracefully.

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null) return v;
  }
  return null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function normalizeMembership(data: Record<string, unknown>): WhopMembershipEvent {
  const user = (data.user ?? {}) as Record<string, unknown>;
  const plan = (data.plan ?? {}) as Record<string, unknown>;

  return {
    membershipId:
      asString(pick(data, "id", "membership_id", "membership")) ?? "",
    whopUserId:
      asString(pick(data, "user_id", "whop_user_id")) ??
      asString(pick(user, "id")) ??
      "",
    productId:
      asString(pick(data, "product_id", "plan_id")) ??
      asString(pick(plan, "id")),
    email:
      asString(pick(data, "email", "user_email")) ??
      asString(pick(user, "email")),
    expiresAt:
      asNumber(pick(data, "expires_at", "valid_until", "renewal_period_end")),
  };
}

function normalizePayment(data: Record<string, unknown>): WhopPaymentEvent {
  return {
    paymentId:
      asString(pick(data, "id", "payment_id")) ?? "",
    membershipId:
      asString(pick(data, "membership_id", "membership")),
    whopUserId:
      asString(pick(data, "user_id", "whop_user_id")),
    amountCents:
      asNumber(pick(data, "final_amount_cents", "subtotal_cents", "amount_cents", "amount")),
    productId:
      asString(pick(data, "product_id", "plan_id")),
  };
}
