/**
 * Promo Code Validation — no auth required (works at signup).
 * POST /api/promo-codes/validate
 * Body: { code: string }
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId } from "@/lib/api-errors";

export const runtime = "nodejs";

const TYPE_DESCRIPTIONS: Record<string, string> = {
  free_trial_extension: "Extended free trial",
  discount_percent: "Discount on your first month",
  discount_fixed: "Fixed discount on your first month",
  free_months: "Free months on your subscription",
  creator_seed: "Free Pro access for creators",
};

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, valid: false, message: "Invalid request" },
      { status: 400 },
    );
  }

  if (!body.code || typeof body.code !== "string") {
    return NextResponse.json(
      { ok: false, valid: false, message: "Code is required" },
      { status: 400 },
    );
  }

  const code = body.code.toUpperCase().trim();

  const { data: promo } = await supabaseAdmin
    .from("promo_codes")
    .select("*")
    .eq("code", code)
    .eq("is_active", true)
    .single();

  if (!promo) {
    return NextResponse.json({
      ok: true,
      valid: false,
      message: "Invalid or expired promo code",
      correlation_id: correlationId,
    });
  }

  // Check max uses
  if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
    return NextResponse.json({
      ok: true,
      valid: false,
      message: "This promo code has been fully redeemed",
      correlation_id: correlationId,
    });
  }

  // Check expiry
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return NextResponse.json({
      ok: true,
      valid: false,
      message: "This promo code has expired",
      correlation_id: correlationId,
    });
  }

  // Build description
  let description = TYPE_DESCRIPTIONS[promo.type] || "Promo applied";
  if (promo.type === "discount_percent") {
    description = `${promo.value}% off your first month`;
  } else if (promo.type === "discount_fixed") {
    description = `$${promo.value} off your first month`;
  } else if (promo.type === "free_months") {
    description = `${promo.value} month${promo.value > 1 ? "s" : ""} free`;
  } else if (promo.type === "creator_seed") {
    description = `${promo.value} month${promo.value > 1 ? "s" : ""} free Pro access`;
  } else if (promo.type === "free_trial_extension") {
    description = `${promo.value} extra days of free trial`;
  }

  const res = NextResponse.json({
    ok: true,
    valid: true,
    type: promo.type,
    value: promo.value,
    description,
    plan_restriction: promo.plan_restriction,
    correlation_id: correlationId,
  });
  res.headers.set("x-correlation-id", correlationId);
  return res;
}
