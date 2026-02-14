import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { notify } from "@/lib/notify";
import { logEvent } from "@/lib/events-log";

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

  const { request_event_id, decision, note } = body as Record<string, unknown>;

  // Validate request_event_id
  if (!request_event_id || typeof request_event_id !== "string") {
    return createApiErrorResponse("BAD_REQUEST", "request_event_id is required", 400, correlationId);
  }

  // Validate decision
  const validDecisions = ["approved", "denied"];
  if (!decision || !validDecisions.includes(decision as string)) {
    return createApiErrorResponse("BAD_REQUEST", "decision must be 'approved' or 'denied'", 400, correlationId);
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
      return createApiErrorResponse("NOT_FOUND", "Upgrade request not found", 404, correlationId);
    }

    const targetUserId = requestEvent.entity_id;

    if (!targetUserId) {
      return createApiErrorResponse("BAD_REQUEST", "Request has no user_id", 400, correlationId);
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
      return createApiErrorResponse("BAD_REQUEST", "This request has already been resolved", 400, correlationId);
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
      return createApiErrorResponse("DB_ERROR", "Failed to resolve request", 500, correlationId);
    }

    // If approved, set user plan to creator_pro via user_subscriptions
    if (decisionValue === "approved") {
      const normalizedUserId = targetUserId.toLowerCase();

      const { error: upsertError } = await supabaseAdmin
        .from("user_subscriptions")
        .upsert({
          user_id: normalizedUserId,
          plan_id: "creator_pro",
          status: "active",
          subscription_type: "saas",
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (upsertError) {
        console.error("Failed to set plan after approval:", upsertError);
        // Continue - resolution was recorded, plan set can be retried
      }

      // Notify about plan change
      notify("admin_set_plan", {
        targetUserId: normalizedUserId,
        plan: "creator_pro",
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
        plan_set: decisionValue === "approved" ? "creator_pro" : null,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("POST /api/admin/upgrade-requests/resolve error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
