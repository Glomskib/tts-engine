import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { apiError, generateCorrelationId } from "@/lib/api-errors";

export const runtime = "nodejs";

interface UpgradeRequest {
  id: string;
  user_id: string;
  email: string | null;
  message: string | null;
  created_at: string;
  status: "pending" | "approved" | "denied";
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

/**
 * GET /api/admin/upgrade-requests
 * Admin-only endpoint to list upgrade requests.
 */
export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);

  try {
    // Fetch upgrade request events
    const { data: requestEvents, error: fetchError } = await supabaseAdmin
      .from("video_events")
      .select("id, created_at, details")
      .eq("event_type", "user_upgrade_requested")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (fetchError) {
      console.error("Failed to fetch upgrade requests:", fetchError);
      const err = apiError("DB_ERROR", "Failed to fetch requests", 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Fetch all resolution events to map against requests
    const requestIds = (requestEvents || []).map((e) => e.id);

    const { data: resolutionEvents } = await supabaseAdmin
      .from("video_events")
      .select("id, created_at, actor, details")
      .eq("event_type", "user_upgrade_request_resolved")
      .order("created_at", { ascending: false });

    // Build map of request_event_id -> resolution
    const resolutionMap = new Map<string, {
      decision: string;
      resolved_at: string;
      resolved_by: string;
      note: string | null;
    }>();

    for (const res of resolutionEvents || []) {
      const details = res.details as Record<string, unknown> | null;
      if (details?.request_event_id) {
        const reqId = details.request_event_id as string;
        if (!resolutionMap.has(reqId)) {
          resolutionMap.set(reqId, {
            decision: details.decision as string,
            resolved_at: res.created_at,
            resolved_by: res.actor,
            note: (details.note as string) || null,
          });
        }
      }
    }

    // Transform to response format
    const requests: UpgradeRequest[] = (requestEvents || []).map((evt) => {
      const details = evt.details as Record<string, unknown> | null;
      const resolution = resolutionMap.get(evt.id);

      return {
        id: evt.id,
        user_id: (details?.user_id as string) || "",
        email: (details?.email as string) || null,
        message: (details?.message as string) || null,
        created_at: evt.created_at,
        status: resolution
          ? (resolution.decision as "approved" | "denied")
          : "pending",
        resolved_at: resolution?.resolved_at || null,
        resolved_by: resolution?.resolved_by || null,
        resolution_note: resolution?.note || null,
      };
    });

    return NextResponse.json({
      ok: true,
      data: {
        requests,
        total: requests.length,
        pending_count: requests.filter((r) => r.status === "pending").length,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/admin/upgrade-requests error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
