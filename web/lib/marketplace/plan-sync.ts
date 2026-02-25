/**
 * Marketplace plan sync — keeps client_plans in sync with Stripe.
 *
 * Called from the Stripe webhook when a subscription is created/updated/canceled
 * and the price_id matches a marketplace tier.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTelegramNotification } from "@/lib/telegram";
import {
  mpTierFromStripePriceId,
  getMpPlanConfig,
  type MpPlanTier,
  type MpPlanStatus,
} from "./plan-config";

// ── Idempotency ────────────────────────────────────────────

/**
 * Check and record a Stripe event ID for idempotency.
 * Returns `true` if the event was already processed.
 */
export async function isEventProcessed(eventId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("stripe_webhook_events")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();

  return !!data;
}

export async function markEventProcessed(eventId: string, eventType: string): Promise<void> {
  await supabaseAdmin.from("stripe_webhook_events").upsert(
    { event_id: eventId, event_type: eventType, processed_at: new Date().toISOString() },
    { onConflict: "event_id" }
  );
}

// ── Subscription → client_plan sync ───────────────────────

interface StripeMpSubscription {
  subscriptionId: string;
  priceId: string;
  status: string;
  currentPeriodEnd: number | null;
  /** client_id stored in subscription metadata */
  clientId: string;
}

/**
 * Upsert client_plans from a Stripe subscription event.
 * Returns true if the update was applied, false if the price_id
 * doesn't map to a marketplace tier.
 */
export async function syncMpPlanFromStripe(
  correlationId: string,
  sub: StripeMpSubscription
): Promise<boolean> {
  const tier = mpTierFromStripePriceId(sub.priceId);
  if (!tier) return false;

  const cfg = getMpPlanConfig(tier);
  const status = mapStripeStatus(sub.status);

  const { error } = await supabaseAdmin
    .from("client_plans")
    .upsert(
      {
        client_id: sub.clientId,
        plan_tier: tier,
        daily_cap: cfg.daily_cap,
        sla_hours: cfg.sla_hours,
        priority_weight: cfg.priority_weight,
        stripe_subscription_id: sub.subscriptionId,
        stripe_price_id: sub.priceId,
        status,
        current_period_end: sub.currentPeriodEnd
          ? new Date(sub.currentPeriodEnd * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id" }
    );

  if (error) {
    console.error(`[${correlationId}] Failed to sync client_plan:`, error);
    return false;
  }

  console.info(
    `[${correlationId}] client_plans synced: client=${sub.clientId} tier=${tier} status=${status}`
  );

  sendTelegramNotification(
    `📋 MP plan sync: client <b>${sub.clientId.slice(0, 8)}</b> → ${cfg.label} (${status})`
  ).catch(() => {});

  return true;
}

/**
 * Downgrade a client to the default pool tier on subscription cancellation.
 */
export async function cancelMpPlan(
  correlationId: string,
  subscriptionId: string
): Promise<boolean> {
  const { data: plan, error: findError } = await supabaseAdmin
    .from("client_plans")
    .select("client_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (findError || !plan) {
    console.warn(`[${correlationId}] No client_plan found for subscription ${subscriptionId}`);
    return false;
  }

  const { error } = await supabaseAdmin
    .from("client_plans")
    .update({
      status: "canceled" as MpPlanStatus,
      stripe_subscription_id: null,
      stripe_price_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", plan.client_id);

  if (error) {
    console.error(`[${correlationId}] Failed to cancel client_plan:`, error);
    return false;
  }

  console.info(`[${correlationId}] client_plan canceled for client ${plan.client_id}`);

  sendTelegramNotification(
    `📉 MP plan canceled: client <b>${plan.client_id.slice(0, 8)}</b>`
  ).catch(() => {});

  return true;
}

// ── Helpers ────────────────────────────────────────────────

function mapStripeStatus(stripeStatus: string): MpPlanStatus {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "canceled";
    case "trialing":
      return "trialing";
    default:
      return "active";
  }
}

/**
 * Extract the marketplace client_id from Stripe subscription metadata.
 * Returns null if not a marketplace subscription.
 */
export function extractMpClientId(metadata: Record<string, string> | null): string | null {
  return metadata?.mp_client_id ?? null;
}

/**
 * Extract the Stripe price ID from a subscription's items.
 */
export function extractPriceId(
  items: { data: Array<{ price?: { id?: string } }> } | undefined
): string | null {
  return items?.data?.[0]?.price?.id ?? null;
}
