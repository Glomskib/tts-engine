import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { notify } from "@/lib/notify";
import { isPaidUser } from "@/lib/subscription";

export const runtime = "nodejs";

const COOLDOWN_HOURS = 24;

/**
 * POST /api/auth/upgrade-request
 * Authenticated users can request an upgrade to Pro plan.
 * Idempotent: only one request per user per 24 hours.
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get authentication context
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const userId = authContext.user.id;
  const userEmail = authContext.user.email || null;

  // Check if user is already on a paid plan
  const alreadyPaid = await isPaidUser(userId);
  if (alreadyPaid) {
    return NextResponse.json({
      ok: true,
      status: "already_paid",
      message: "You already have a paid subscription.",
      correlation_id: correlationId,
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { message } = body as Record<string, unknown>;
  const requestMessage = typeof message === "string" ? message.trim().slice(0, 500) : null;

  try {
    // Check for existing request within cooldown period (idempotency)
    const cooldownTime = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();

    const { data: existingRequests, error: checkError } = await supabaseAdmin
      .from("events_log")
      .select("id, created_at, payload")
      .eq("entity_type", "user")
      .eq("entity_id", userId)
      .eq("event_type", "user_upgrade_requested")
      .gte("created_at", cooldownTime)
      .order("created_at", { ascending: false });

    if (checkError) {
      console.error("Error checking existing requests:", checkError);
    }

    // Check if there's an unresolved request
    if (existingRequests && existingRequests.length > 0) {
      // Check if the most recent request is unresolved
      const latestRequest = existingRequests[0];
      const latestRequestId = latestRequest.id;

      // Check if it was resolved
      const { data: resolutions } = await supabaseAdmin
        .from("events_log")
        .select("id")
        .eq("entity_type", "user")
        .eq("entity_id", userId)
        .eq("event_type", "user_upgrade_request_resolved")
        .filter("payload->>request_event_id", "eq", latestRequestId)
        .limit(1);

      if (!resolutions || resolutions.length === 0) {
        // Still pending - return already_requested
        return NextResponse.json({
          ok: true,
          status: "already_requested",
          message: "You have already requested an upgrade within the last 24 hours.",
          correlation_id: correlationId,
        });
      }
    }

    // Create new upgrade request event in events_log
    const { data: newEvent, error: insertError } = await supabaseAdmin
      .from("events_log")
      .insert({
        entity_type: "user",
        entity_id: userId,
        event_type: "user_upgrade_requested",
        payload: {
          email: userEmail,
          requested_plan: "pro",
          message: requestMessage,
          source: "/upgrade",
        },
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to create upgrade request:", insertError);
      return createApiErrorResponse("DB_ERROR", "Failed to submit request", 500, correlationId);
    }

    // Notify ops (Slack/email if configured)
    notify("user_upgrade_requested", {
      targetUserId: userId,
      userEmail: userEmail || undefined,
      requestMessage: requestMessage || undefined,
    });

    return NextResponse.json({
      ok: true,
      status: "requested",
      message: "Your upgrade request has been submitted.",
      request_id: newEvent?.id,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("POST /api/auth/upgrade-request error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
