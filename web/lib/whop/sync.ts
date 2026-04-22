/**
 * @module whop/sync
 *
 * Translates a verified Whop webhook event into DB writes across
 * `user_subscriptions` (legacy plan table read by getVEPlan) and
 * `ff_entitlements` (single source of truth for paid access).
 *
 * The webhook route owns signature verification + idempotency and calls
 * into this module with a normalized shape.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { upsertEntitlement } from "@/lib/entitlements";
import { syncRoleFromPlan } from "@/lib/sync-role";
import { sendTelegramNotification } from "@/lib/telegram";
import { mapWhopProductToPlan, DEACTIVATED_PLAN, type WhopPlanMapping } from "./config";

// ── Normalized event shapes ───────────────────────────────

export interface WhopMembershipEvent {
  /** Whop membership ID (mem_...). */
  membershipId: string;
  /** Whop user ID (user_...). */
  whopUserId: string;
  /** Whop product / plan ID (prod_...). */
  productId: string | null;
  /** Email on the Whop account — used to link to an existing Supabase user. */
  email: string | null;
  /** Unix seconds, if provided by the payload. */
  expiresAt: number | null;
}

export interface WhopPaymentEvent {
  paymentId: string;
  membershipId: string | null;
  whopUserId: string | null;
  amountCents: number | null;
  /** Optional product ID on the payment — we fall back to the membership row if absent. */
  productId: string | null;
}

// ── Supabase user resolution ──────────────────────────────

/**
 * Find an existing Supabase user by email. Paginates through auth.users —
 * acceptable for current scale. If not found, returns null (caller decides
 * whether to create).
 */
async function findSupabaseUserByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;
  for (let i = 0; i < 50; i++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("[whop/sync] listUsers failed:", error);
      return null;
    }
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === normalized);
    if (match) return match.id;
    if (data.users.length < perPage) return null;
    page += 1;
  }
  return null;
}

/** Look up a Supabase user by a previously-linked whop_user_id. */
async function findSupabaseUserByWhopId(whopUserId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("ff_entitlements")
    .select("user_id")
    .eq("whop_user_id", whopUserId)
    .maybeSingle();
  if (data?.user_id) return data.user_id;

  const { data: sub } = await supabaseAdmin
    .from("user_subscriptions")
    .select("user_id")
    .eq("whop_user_id", whopUserId)
    .maybeSingle();
  return sub?.user_id ?? null;
}

/**
 * Resolve a Whop event to a Supabase user ID. Order:
 *   1. Previously-linked whop_user_id (fastest path for returning buyers).
 *   2. Email match on an existing Supabase auth user.
 *   3. Create a new Supabase auth user by email.
 *      The DB trigger (initialize_user_credits) seeds the free-tier rows.
 *
 * Returns null only if we have no email and no prior link — the caller
 * should log and bail.
 */
export async function resolveOrCreateUser(whopUserId: string, email: string | null, correlationId: string): Promise<string | null> {
  const existingByWhop = await findSupabaseUserByWhopId(whopUserId);
  if (existingByWhop) return existingByWhop;

  if (!email) {
    console.warn(`[${correlationId}] whop/sync: no email and no prior link for whop_user_id=${whopUserId}`);
    return null;
  }

  const existingByEmail = await findSupabaseUserByEmail(email);
  if (existingByEmail) return existingByEmail;

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { whop_user_id: whopUserId, source: "whop_webhook" },
  });
  if (error || !created.user) {
    console.error(`[${correlationId}] whop/sync: createUser failed for ${email}:`, error);
    return null;
  }
  console.info(`[${correlationId}] whop/sync: provisioned new Supabase user ${created.user.id} from Whop email ${email}`);
  return created.user.id;
}

// ── Event handlers ────────────────────────────────────────

export async function handleMembershipActivated(event: WhopMembershipEvent, correlationId: string): Promise<void> {
  const mapping = mapWhopProductToPlan(event.productId);
  if (!mapping) {
    console.warn(`[${correlationId}] whop/sync: unknown product ${event.productId} — skipping. Add WHOP_PRODUCT_* env var to enable.`);
    return;
  }

  const userId = await resolveOrCreateUser(event.whopUserId, event.email, correlationId);
  if (!userId) return;

  await writePlan(userId, mapping, {
    status: "active",
    whopUserId: event.whopUserId,
    whopMembershipId: event.membershipId,
    whopProductId: event.productId,
    currentPeriodEnd: event.expiresAt ? new Date(event.expiresAt * 1000).toISOString() : null,
    correlationId,
    resetUsage: true,
  });

  sendTelegramNotification(
    `🎟️ Whop: <b>${event.email ?? event.whopUserId}</b> activated → ${mapping.label}`
  ).catch(() => {});
}

export async function handleMembershipDeactivated(event: WhopMembershipEvent, correlationId: string): Promise<void> {
  const userId = await resolveOrCreateUser(event.whopUserId, event.email, correlationId);
  if (!userId) return;

  await writePlan(userId, DEACTIVATED_PLAN, {
    status: "canceled",
    whopUserId: event.whopUserId,
    whopMembershipId: event.membershipId,
    whopProductId: event.productId,
    currentPeriodEnd: null,
    correlationId,
    resetUsage: false,
  });

  sendTelegramNotification(
    `📉 Whop: <b>${event.email ?? event.whopUserId}</b> deactivated → downgraded to free`
  ).catch(() => {});
}

/**
 * payment.succeeded doesn't change the plan by itself — the companion
 * membership.activated does. We use it to confirm the membership is still
 * active and refresh the current_period_end if the payload tells us to.
 * If we can't find the underlying user yet, we noop: the membership event
 * that arrives alongside will do the sync.
 */
export async function handlePaymentSucceeded(event: WhopPaymentEvent, correlationId: string): Promise<void> {
  if (!event.whopUserId) return;
  const userId = await findSupabaseUserByWhopId(event.whopUserId);
  if (!userId) {
    console.info(`[${correlationId}] whop/sync: payment for unlinked whop_user_id=${event.whopUserId} — waiting for membership event`);
    return;
  }

  await upsertEntitlement(userId, { status: "active" }, correlationId);

  console.info(
    `[${correlationId}] whop/sync: payment ${event.paymentId} confirmed for user ${userId} (${event.amountCents ?? "?"}¢)`
  );
}

// ── Shared write path ─────────────────────────────────────

interface WritePlanOpts {
  status: "active" | "canceled" | "past_due";
  whopUserId: string;
  whopMembershipId: string;
  whopProductId: string | null;
  currentPeriodEnd: string | null;
  correlationId: string;
  /** When true, zero usage counters and stamp current_period_start = now. */
  resetUsage: boolean;
}

async function writePlan(userId: string, mapping: WhopPlanMapping, opts: WritePlanOpts): Promise<void> {
  const now = new Date().toISOString();

  const { error: subErr } = await supabaseAdmin.from("user_subscriptions").upsert(
    {
      user_id: userId,
      plan_id: mapping.legacyPlanId,
      subscription_type: "saas",
      status: opts.status === "canceled" ? "cancelled" : opts.status, // table stores the British spelling
      whop_user_id: opts.whopUserId,
      whop_membership_id: opts.whopMembershipId,
      whop_product_id: opts.whopProductId,
      ...(opts.currentPeriodEnd ? { current_period_end: opts.currentPeriodEnd } : {}),
      updated_at: now,
    },
    { onConflict: "user_id" }
  );
  if (subErr) {
    console.error(`[${opts.correlationId}] whop/sync: user_subscriptions upsert failed:`, subErr);
    sendTelegramNotification(
      `🚨 Whop: user_subscriptions upsert failed for ${userId}. CorrelationId: ${opts.correlationId}.`
    ).catch(() => {});
  }

  await upsertEntitlement(
    userId,
    {
      plan: mapping.entitlementPlan,
      status: opts.status,
      current_period_end: opts.currentPeriodEnd,
    },
    opts.correlationId
  );

  // Patch whop_* + usage fields on ff_entitlements directly
  // (upsertEntitlement doesn't know about them).
  const patch: Record<string, unknown> = {
    whop_user_id: opts.whopUserId,
    whop_membership_id: opts.whopMembershipId,
  };
  if (opts.resetUsage) {
    patch.clips_generated = 0;
    patch.videos_processed = 0;
    patch.current_period_start = new Date().toISOString();
  }
  const { error: entErr } = await supabaseAdmin
    .from("ff_entitlements")
    .update(patch)
    .eq("user_id", userId);
  if (entErr) {
    console.error(`[${opts.correlationId}] whop/sync: ff_entitlements whop_* patch failed:`, entErr);
  }

  await syncRoleFromPlan(userId, mapping.legacyPlanId).catch((err) => {
    console.error(`[${opts.correlationId}] whop/sync: syncRoleFromPlan failed:`, err);
  });
}
