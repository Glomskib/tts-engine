/**
 * Admin Promo Code Management API
 * GET  — List all promo codes (admin only)
 * POST — Create a new promo code (admin only)
 */

import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user || !authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from("promo_codes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  const res = NextResponse.json({ ok: true, data: data || [], correlation_id: correlationId });
  res.headers.set("x-correlation-id", correlationId);
  return res;
}

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user || !authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  const body = await request.json();

  // Handle batch generation (e.g., "generate 30 creator seed codes")
  if (body.action === "batch_generate") {
    const count = body.count || 30;
    const prefix = body.prefix || "FLASH";
    const type = body.type || "creator_seed";
    const value = body.value || 1;
    const planRestriction = body.plan_restriction || null;

    const codes: string[] = [];
    for (let i = 1; i <= count; i++) {
      const code = `${prefix}-${String(i).padStart(3, "0")}`;
      const { error } = await supabaseAdmin.from("promo_codes").insert({
        code,
        type,
        value,
        plan_restriction: planRestriction,
        max_uses: 1,
        metadata: body.metadata || {},
      });
      if (!error) codes.push(code);
    }

    const res = NextResponse.json({
      ok: true,
      data: { generated: codes.length, codes },
      correlation_id: correlationId,
    });
    res.headers.set("x-correlation-id", correlationId);
    return res;
  }

  // Single code creation
  if (!body.code || !body.type || body.value === undefined) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "code, type, and value are required",
      400,
      correlationId,
    );
  }

  const { data, error } = await supabaseAdmin
    .from("promo_codes")
    .insert({
      code: body.code.toUpperCase().trim(),
      type: body.type,
      value: body.value,
      plan_restriction: body.plan_restriction || null,
      max_uses: body.max_uses || null,
      expires_at: body.expires_at || null,
      metadata: body.metadata || {},
    })
    .select()
    .single();

  if (error) {
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  const res = NextResponse.json({ ok: true, data, correlation_id: correlationId });
  res.headers.set("x-correlation-id", correlationId);
  return res;
}
