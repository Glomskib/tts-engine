/**
 * Cron: Monthly credit reset
 *
 * Safety net for paid-plan credit renewals that the Stripe webhook may have missed,
 * plus the primary mechanism for resetting free-tier users (no Stripe invoice fires for them).
 *
 * Runs at 03:00 UTC on the 1st of every month.
 * Schedule: "0 3 1 * *"
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { CREDIT_ALLOCATIONS } from "@/lib/subscriptions";
import { sendTelegramNotification } from "@/lib/telegram";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const FREE_CREDITS = 5;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();
  let resetPaid = 0;
  let resetFree = 0;
  const errors: string[] = [];

  // ── 1. Free-tier users: refill 5 credits/month ───────────────────────────
  // Free users never get Stripe invoices, so the webhook never resets them.
  // Target: user_subscriptions.plan_id = 'free' AND user_credits.period_end < now
  const { data: freeUsers, error: freeQueryErr } = await supabaseAdmin
    .from("user_subscriptions")
    .select("user_id")
    .eq("plan_id", "free")
    .eq("status", "active");

  if (freeQueryErr) {
    console.error("[cron/reset-monthly-credits] Free user query failed:", freeQueryErr.message);
    errors.push(`free-query: ${freeQueryErr.message}`);
  } else if (freeUsers && freeUsers.length > 0) {
    // Only reset free users whose credit period has already expired
    const freeUserIds = freeUsers.map((u) => u.user_id);

    const { data: expiredFree, error: expiredFreeErr } = await supabaseAdmin
      .from("user_credits")
      .select("user_id")
      .in("user_id", freeUserIds)
      .lt("period_end", now);

    if (expiredFreeErr) {
      console.error("[cron/reset-monthly-credits] Expired free query failed:", expiredFreeErr.message);
      errors.push(`expired-free-query: ${expiredFreeErr.message}`);
    } else if (expiredFree && expiredFree.length > 0) {
      const newPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      for (const { user_id } of expiredFree) {
        const { error: updateErr } = await supabaseAdmin
          .from("user_credits")
          .update({
            credits_remaining: FREE_CREDITS,
            credits_used_this_period: 0,
            period_start: now,
            period_end: newPeriodEnd,
            updated_at: now,
          })
          .eq("user_id", user_id);

        if (updateErr) {
          console.error(`[cron/reset-monthly-credits] Free reset failed for ${user_id}:`, updateErr.message);
          errors.push(`free-reset-${user_id}: ${updateErr.message}`);
          continue;
        }

        // Log the transaction
        await supabaseAdmin.from("credit_transactions").insert({
          user_id,
          amount: FREE_CREDITS,
          type: "monthly_reset",
          description: "Monthly free-tier credit refill",
        });

        resetFree++;
      }
    }
  }

  // ── 2. Paid users: safety net for missed webhook resets ──────────────────
  // Target: active paid subscriptions where user_credits.period_end < now
  // (meaning invoice.paid webhook fired but credit reset didn't complete).
  // Unlimited plans (credits = -1) are skipped — they don't need resets.
  const { data: paidSubs, error: paidQueryErr } = await supabaseAdmin
    .from("user_subscriptions")
    .select("user_id, plan_id")
    .eq("status", "active")
    .neq("plan_id", "free");

  if (paidQueryErr) {
    console.error("[cron/reset-monthly-credits] Paid subscription query failed:", paidQueryErr.message);
    errors.push(`paid-query: ${paidQueryErr.message}`);
  } else if (paidSubs && paidSubs.length > 0) {
    const paidUserIds = paidSubs.map((s) => s.user_id);
    const planByUserId = Object.fromEntries(paidSubs.map((s) => [s.user_id, s.plan_id]));

    const { data: expiredPaid, error: expiredPaidErr } = await supabaseAdmin
      .from("user_credits")
      .select("user_id")
      .in("user_id", paidUserIds)
      .lt("period_end", now);

    if (expiredPaidErr) {
      console.error("[cron/reset-monthly-credits] Expired paid query failed:", expiredPaidErr.message);
      errors.push(`expired-paid-query: ${expiredPaidErr.message}`);
    } else if (expiredPaid && expiredPaid.length > 0) {
      const newPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      for (const { user_id } of expiredPaid) {
        const planId = planByUserId[user_id];
        const creditsToReset = CREDIT_ALLOCATIONS[planId] ?? 0;

        // Skip unlimited plans (credits = -1); their webhook handler is the authority
        if (creditsToReset <= 0) continue;

        const { error: updateErr } = await supabaseAdmin
          .from("user_credits")
          .update({
            credits_remaining: creditsToReset,
            credits_used_this_period: 0,
            period_start: now,
            period_end: newPeriodEnd,
            updated_at: now,
          })
          .eq("user_id", user_id);

        if (updateErr) {
          console.error(`[cron/reset-monthly-credits] Paid reset failed for ${user_id}:`, updateErr.message);
          errors.push(`paid-reset-${user_id}: ${updateErr.message}`);
          continue;
        }

        await supabaseAdmin.from("credit_transactions").insert({
          user_id,
          amount: creditsToReset,
          type: "monthly_reset",
          description: `Monthly credit reset — ${planId} (cron safety net)`,
        });

        resetPaid++;
      }
    }
  }

  const summary = `Credit reset: ${resetFree} free users + ${resetPaid} paid safety-net resets`;
  console.info(`[cron/reset-monthly-credits] ${summary}`);

  if (errors.length > 0) {
    sendTelegramNotification(
      `⚠️ Monthly credit reset partial failure\n${summary}\nErrors (${errors.length}): ${errors.slice(0, 3).join(", ")}`
    ).catch(() => {});
  } else {
    sendTelegramNotification(`✅ ${summary}`).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    resetFree,
    resetPaid,
    errors: errors.length,
  });
}
