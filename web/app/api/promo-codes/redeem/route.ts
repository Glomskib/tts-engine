/**
 * Promo Code Redemption — auth required.
 * POST /api/promo-codes/redeem
 * Body: { code: string }
 */

import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const userId = authContext.user.id;
  const body = await request.json();
  const code = (body.code || "").toUpperCase().trim();

  if (!code) {
    return createApiErrorResponse("BAD_REQUEST", "Promo code is required", 400, correlationId);
  }

  // Find the promo code
  const { data: promo } = await supabaseAdmin
    .from("promo_codes")
    .select("*")
    .eq("code", code)
    .eq("is_active", true)
    .single();

  if (!promo) {
    return createApiErrorResponse("NOT_FOUND", "Invalid or expired promo code", 404, correlationId);
  }

  // Check max uses
  if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
    return createApiErrorResponse("NOT_AVAILABLE", "This promo code has been fully redeemed", 400, correlationId);
  }

  // Check expiry
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return createApiErrorResponse("NOT_AVAILABLE", "This promo code has expired", 400, correlationId);
  }

  // Check if user already redeemed this code
  const { data: existing } = await supabaseAdmin
    .from("promo_redemptions")
    .select("id")
    .eq("promo_code_id", promo.id)
    .eq("user_id", userId)
    .single();

  if (existing) {
    return createApiErrorResponse("CONFLICT", "You have already redeemed this code", 409, correlationId);
  }

  // Record redemption
  const { error: redeemError } = await supabaseAdmin.from("promo_redemptions").insert({
    promo_code_id: promo.id,
    user_id: userId,
  });

  if (redeemError) {
    return createApiErrorResponse("DB_ERROR", redeemError.message, 500, correlationId);
  }

  // Increment usage count
  await supabaseAdmin
    .from("promo_codes")
    .update({ current_uses: (promo.current_uses || 0) + 1 })
    .eq("id", promo.id);

  // Apply the promo effect
  let effectDescription = "Promo applied";

  if (promo.type === "creator_seed" || promo.type === "free_months") {
    // Grant free months: upgrade to the plan for X months
    const planId = promo.plan_restriction || "creator";
    const months = promo.value;

    await supabaseAdmin
      .from("user_subscriptions")
      .upsert({
        user_id: userId,
        plan_id: planId,
        subscription_type: "saas",
        status: "active",
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(
          Date.now() + months * 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    effectDescription = `${months} month${months > 1 ? "s" : ""} of free ${planId} access activated`;
  } else if (promo.type === "free_trial_extension") {
    // Extend the trial period by X days
    const { data: sub } = await supabaseAdmin
      .from("user_subscriptions")
      .select("current_period_end")
      .eq("user_id", userId)
      .single();

    const currentEnd = sub?.current_period_end
      ? new Date(sub.current_period_end)
      : new Date();
    const newEnd = new Date(
      currentEnd.getTime() + promo.value * 24 * 60 * 60 * 1000,
    );

    await supabaseAdmin
      .from("user_subscriptions")
      .update({
        current_period_end: newEnd.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    effectDescription = `Trial extended by ${promo.value} days`;
  }
  // discount_percent and discount_fixed are applied at Stripe checkout, not here

  const res = NextResponse.json({
    ok: true,
    data: {
      code: promo.code,
      type: promo.type,
      effect: effectDescription,
    },
    correlation_id: correlationId,
  });
  res.headers.set("x-correlation-id", correlationId);
  return res;
}
