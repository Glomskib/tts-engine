import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { notify } from "@/lib/notify";
import { logEvent } from "@/lib/events-log";
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
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Admin-only
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  const { user_id, plan, is_active } = body as Record<string, unknown>;

  // Validate user_id
  if (!user_id || typeof user_id !== "string") {
    return createApiErrorResponse("BAD_REQUEST", "user_id is required", 400, correlationId);
  }

  // Validate plan — accepts all 5 tiers
  const validPlans: PlanType[] = ["free", "creator_lite", "creator_pro", "brand", "agency"];
  if (!plan || !validPlans.includes(plan as PlanType)) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      `plan must be one of: ${validPlans.join(", ")}`,
      400,
      correlationId
    );
  }

  const normalizedUserId = user_id.toLowerCase();
  const planValue = plan as PlanType;
  const isActiveValue = is_active !== false;

  try {
    // Write admin_set_plan event to events_log
    await logEvent(supabaseAdmin, {
      entity_type: "user",
      entity_id: normalizedUserId,
      event_type: "admin_set_plan",
      payload: {
        plan: planValue,
        is_active: isActiveValue,
        set_by: authContext.user.id,
        set_by_email: authContext.user.email || null,
      },
    });

    // Also update user_subscriptions table directly so getUserPlan() picks it up
    await supabaseAdmin
      .from("user_subscriptions")
      .upsert({
        user_id: normalizedUserId,
        plan_id: planValue,
        status: isActiveValue ? "active" : "cancelled",
        subscription_type: "saas",
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

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
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
