import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

interface EventRow {
  id: string;
  video_id: string | null;
  event_type: string;
  actor: string | null;
  from_status: string | null;
  to_status: string | null;
  correlation_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

/**
 * GET /api/admin/events
 * Admin-only. Global events explorer with filtering.
 * Query params:
 *   - limit: number (default: 100, max: 500)
 *   - type: event_type filter (optional)
 *   - video_id: filter by video (optional)
 *   - user_id: filter by actor (optional)
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  // Admin-only check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  // Parse query params
  const limitParam = parseInt(searchParams.get("limit") || "100", 10);
  const limit = Math.min(Math.max(1, limitParam), 500);
  const typeFilter = searchParams.get("type") || null;
  const videoIdFilter = searchParams.get("video_id") || null;
  const userIdFilter = searchParams.get("user_id") || null;

  try {
    let query = supabaseAdmin
      .from("video_events")
      .select("id,video_id,event_type,actor,from_status,to_status,correlation_id,details,created_at")
      .order("created_at", { ascending: false });

    // Apply filters
    if (typeFilter) {
      query = query.eq("event_type", typeFilter);
    }

    if (videoIdFilter) {
      query = query.eq("video_id", videoIdFilter);
    }

    if (userIdFilter) {
      query = query.eq("actor", userIdFilter);
    }

    query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error("GET /api/admin/events error:", error);
      return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
    }

    const events = (data || []) as unknown as EventRow[];

    // Transform to response format
    const transformedEvents = events.map((event) => ({
      id: event.id,
      created_at: event.created_at,
      type: event.event_type,
      video_id: event.video_id,
      actor_user_id: event.actor,
      target_user_id: event.details?.to_user_id || event.details?.assigned_to || null,
      from_status: event.from_status,
      to_status: event.to_status,
      correlation_id: event.correlation_id,
      metadata: event.details,
    }));

    return NextResponse.json({
      ok: true,
      data: transformedEvents,
      meta: {
        count: transformedEvents.length,
        filters: {
          type: typeFilter,
          video_id: videoIdFilter,
          user_id: userIdFilter,
        },
        limit,
      },
      correlation_id: correlationId,
    });

  } catch (err) {
    console.error("GET /api/admin/events error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
