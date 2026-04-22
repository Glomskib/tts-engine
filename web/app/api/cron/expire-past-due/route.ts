/**
 * Cron: Expire past_due subscriptions
 *
 * After a 3-day grace period, subscriptions still marked past_due are downgraded
 * to the free plan. Stripe should fire customer.subscription.deleted for these,
 * but this cron catches any gaps (e.g. webhook delivery failures).
 *
 * Runs daily at 04:00 UTC.
 * Schedule: "0 4 * * *"
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTelegramNotification } from "@/lib/telegram";
import { syncRoleFromPlan } from "@/lib/sync-role";
import { upsertEntitlement } from "@/lib/entitlements";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const GRACE_PERIOD_DAYS = 3;
const FREE_CREDITS = 5;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const graceCutoff = new Date(
    Date.now() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // Find subscriptions past_due for longer than the grace period
  const { data: overdue, error: queryErr } = await supabaseAdmin
    .from("user_subscriptions")
    .select("user_id, stripe_subscription_id")
    .eq("status", "past_due")
    .lt("updated_at", graceCutoff);

  if (queryErr) {
    console.error("[cron/expire-past-due] Query failed:", queryErr.message);
    return NextResponse.json({ error: queryErr.message }, { status: 500 });
  }

  if (!overdue || overdue.length === 0) {
    console.info("[cron/expire-past-due] No overdue past_due subscriptions found");
    return NextResponse.json({ ok: true, expired: 0 });
  }

  let expired = 0;
  const errors: string[] = [];
  const now = new Date().toISOString();

  for (const sub of overdue) {
    const { user_id } = sub;

    // Downgrade subscription to free
    const { error: subErr } = await supabaseAdmin
      .from("user_subscriptions")
      .update({
        plan_id: "free",
        subscription_type: "saas",
        status: "cancelled",
        stripe_subscription_id: null,
        videos_per_month: 0,
        videos_remaining: 0,
        videos_used_this_month: 0,
        updated_at: now,
      })
      .eq("user_id", user_id);

    if (subErr) {
      console.error(`[cron/expire-past-due] Sub update failed for ${user_id}:`, subErr.message);
      errors.push(user_id);
      continue;
    }

    // Reset credits to free tier
    const { error: creditErr } = await supabaseAdmin
      .from("user_credits")
      .update({
        credits_remaining: FREE_CREDITS,
        credits_used_this_period: 0,
        period_start: now,
        period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: now,
      })
      .eq("user_id", user_id);

    if (creditErr) {
      console.error(`[cron/expire-past-due] Credit reset failed for ${user_id}:`, creditErr.message);
    }

    // Sync role to free
    await syncRoleFromPlan(user_id, "free").catch((e: unknown) =>
      console.error(`[cron/expire-past-due] Role sync failed for ${user_id}:`, e)
    );

    // Update entitlement
    await upsertEntitlement(
      user_id,
      { plan: "free", status: "canceled", stripe_subscription_id: null, current_period_end: null },
      "cron-expire-past-due"
    ).catch((e: unknown) =>
      console.error(`[cron/expire-past-due] Entitlement update failed for ${user_id}:`, e)
    );

    // Log transaction
    await supabaseAdmin.from("credit_transactions").insert({
      user_id,
      amount: FREE_CREDITS,
      type: "downgrade",
      description: `Past-due grace period expired — downgraded to free (${GRACE_PERIOD_DAYS}d)`,
    });

    expired++;
    console.info(`[cron/expire-past-due] Downgraded user ${user_id.slice(0, 8)} to free`);
  }

  const summary = `Expired ${expired}/${overdue.length} past-due subscriptions to free`;
  console.info(`[cron/expire-past-due] ${summary}`);

  if (expired > 0 || errors.length > 0) {
    sendTelegramNotification(
      `📉 Past-due expiry: ${expired} downgraded to free${errors.length ? ` | ${errors.length} errors` : ""}`
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true, expired, errors: errors.length });
}
