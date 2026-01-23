import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { notify } from "@/lib/notify";
import type { PlanType } from "@/lib/subscription";

export const runtime = "nodejs";

/**
 * POST /api/admin/users/set-plan
 * Admin-only endpoint to set a user's subscription plan.
 * Writes an admin_set_plan event to video_events table (no schema migration required).
 *
 * Body: { user_id: string, plan: "free" | "pro", is_active?: boolean }
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get authentication context
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Admin-only
  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON body", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const { user_id, plan, is_active } = body as Record<string, unknown>;

  // Validate user_id
  if (!user_id || typeof user_id !== "string") {
    const err = apiError("BAD_REQUEST", "user_id is required", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate plan
  const validPlans: PlanType[] = ["free", "pro"];
  if (!plan || !validPlans.includes(plan as PlanType)) {
    const err = apiError("BAD_REQUEST", "plan must be 'free' or 'pro'", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const normalizedUserId = user_id.toLowerCase();
  const planValue = plan as PlanType;
  const isActiveValue = is_active !== false;

  try {
    // Write admin_set_plan event to video_events
    // Using video_id = null (or we can use a placeholder), actor = target user_id
    const { error: insertError } = await supabaseAdmin.from("video_events").insert({
      video_id: null,
      event_type: "admin_set_plan",
      correlation_id: correlationId,
      actor: normalizedUserId,
      from_status: null,
      to_status: null,
      details: {
        plan: planValue,
        is_active: isActiveValue,
        set_by: authContext.user.id,
        set_by_email: authContext.user.email || null,
      },
    });

    if (insertError) {
      console.error("Failed to insert admin_set_plan event:", insertError);
      const err = apiError("DB_ERROR", "Failed to set plan", 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Notify via Slack (admin action)
    notify("admin_set_plan", {
      targetUserId: normalizedUserId,
      plan: planValue,
      isActive: isActiveValue,
      performedBy: authContext.user.email || authContext.user.id,
    });

    return NextResponse.json({
      ok: true,
      data: {
        user_id: normalizedUserId,
        plan: planValue,
        is_active: isActiveValue,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("POST /api/admin/users/set-plan error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
