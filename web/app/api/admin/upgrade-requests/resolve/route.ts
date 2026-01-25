import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { notify } from "@/lib/notify";
import { logEvent, logEventSafe } from "@/lib/events-log";

export const runtime = "nodejs";

/**
 * POST /api/admin/upgrade-requests/resolve
 * Admin-only endpoint to resolve an upgrade request (approve/deny).
 * If approved, sets the user's plan to Pro via admin_set_plan event.
 *
 * Body: { request_event_id: string, decision: "approved" | "denied", note?: string }
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

  const { request_event_id, decision, note } = body as Record<string, unknown>;

  // Validate request_event_id
  if (!request_event_id || typeof request_event_id !== "string") {
    const err = apiError("BAD_REQUEST", "request_event_id is required", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate decision
  const validDecisions = ["approved", "denied"];
  if (!decision || !validDecisions.includes(decision as string)) {
    const err = apiError("BAD_REQUEST", "decision must be 'approved' or 'denied'", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const decisionValue = decision as "approved" | "denied";
  const noteValue = typeof note === "string" ? note.trim().slice(0, 500) : null;

  try {
    // Fetch the original request event from events_log
    const { data: requestEvent, error: fetchError } = await supabaseAdmin
      .from("events_log")
      .select("id, entity_id, payload")
      .eq("id", request_event_id)
      .eq("event_type", "user_upgrade_requested")
      .single();

    if (fetchError || !requestEvent) {
      const err = apiError("NOT_FOUND", "Upgrade request not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const targetUserId = requestEvent.entity_id;

    if (!targetUserId) {
      const err = apiError("BAD_REQUEST", "Request has no user_id", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Check if already resolved
    const { data: existingResolution } = await supabaseAdmin
      .from("events_log")
      .select("id")
      .eq("entity_type", "user")
      .eq("event_type", "user_upgrade_request_resolved")
      .filter("payload->>request_event_id", "eq", request_event_id)
      .limit(1);

    if (existingResolution && existingResolution.length > 0) {
      const err = apiError("BAD_REQUEST", "This request has already been resolved", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Create resolution event in events_log
    try {
      await logEvent(supabaseAdmin, {
        entity_type: "user",
        entity_id: targetUserId,
        event_type: "user_upgrade_request_resolved",
        payload: {
          request_event_id: request_event_id,
          decision: decisionValue,
          note: noteValue,
          resolved_by: authContext.user.id,
          resolved_by_email: authContext.user.email || null,
        },
      });
    } catch (resolutionError) {
      console.error("Failed to create resolution event:", resolutionError);
      const err = apiError("DB_ERROR", "Failed to resolve request", 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // If approved, set user plan to Pro (same logic as set-plan endpoint)
    if (decisionValue === "approved") {
      const normalizedUserId = targetUserId.toLowerCase();

      // Use logEventSafe - don't fail if plan set fails (resolution already recorded)
      const planLogged = await logEventSafe(supabaseAdmin, {
        entity_type: "user",
        entity_id: normalizedUserId,
        event_type: "admin_set_plan",
        payload: {
          plan: "pro",
          is_active: true,
          set_by: authContext.user.id,
          set_by_email: authContext.user.email || null,
          source: "upgrade_request_approved",
          request_event_id: request_event_id,
        },
      });

      if (!planLogged) {
        console.error("Failed to set plan after approval");
        // Continue - resolution was recorded, plan set can be retried
      }

      // Notify about plan change
      notify("admin_set_plan", {
        targetUserId: normalizedUserId,
        plan: "pro",
        isActive: true,
        performedBy: authContext.user.email || authContext.user.id,
      });
    }

    // Notify about resolution
    notify("user_upgrade_request_resolved", {
      targetUserId,
      decision: decisionValue,
      notes: noteValue,
      performedBy: authContext.user.email || authContext.user.id,
      requestEventId: request_event_id,
    });

    return NextResponse.json({
      ok: true,
      data: {
        request_event_id,
        decision: decisionValue,
        user_id: targetUserId,
        plan_set: decisionValue === "approved" ? "pro" : null,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("POST /api/admin/upgrade-requests/resolve error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
