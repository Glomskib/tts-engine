import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ video_id: string }>;
}

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

interface VideoRow {
  id: string;
  recording_status: string | null;
  created_at: string;
  updated_at: string | null;
  assigned_to: string | null;
  assigned_role: string | null;
  assigned_at: string | null;
  assigned_expires_at: string | null;
  assignment_state: string | null;
  work_lane: string | null;
  work_priority: number | null;
  last_status_changed_at: string | null;
}

interface TimelineItem {
  ts: string;
  type: "event" | "assignment" | "video_snapshot";
  label: string;
  metadata: Record<string, unknown>;
}

/**
 * GET /api/admin/videos/[video_id]/timeline
 * Admin-only. Provides a unified timeline of a video's lifecycle.
 * Query params:
 *   - limit: number (default: 50, max: 200)
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { video_id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(video_id)) {
    const err = apiError("INVALID_UUID", "Invalid video ID format", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Admin-only check
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const limitParam = parseInt(searchParams.get("limit") || "50", 10);
  const limit = Math.min(Math.max(1, limitParam), 200);

  try {
    // Check available columns
    const existingColumns = await getVideosColumns();
    const hasAssignmentColumns = existingColumns.has("assignment_state") && existingColumns.has("assigned_expires_at");

    // Fetch video details
    let videoSelectCols = "id,recording_status,created_at,updated_at,last_status_changed_at";
    if (hasAssignmentColumns) {
      videoSelectCols += ",assigned_to,assigned_role,assigned_at,assigned_expires_at,assignment_state,work_lane,work_priority";
    }

    const { data: video, error: videoError } = await supabaseAdmin
      .from("videos")
      .select(videoSelectCols)
      .eq("id", video_id)
      .single();

    if (videoError || !video) {
      const err = apiError("NOT_FOUND", "Video not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const videoRow = video as unknown as VideoRow;

    // Fetch events for this video
    const { data: eventsData, error: eventsError } = await supabaseAdmin
      .from("video_events")
      .select("id,video_id,event_type,actor,from_status,to_status,correlation_id,details,created_at")
      .eq("video_id", video_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (eventsError) {
      console.error("GET /api/admin/videos/[id]/timeline events error:", eventsError);
      const err = apiError("DB_ERROR", eventsError.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const events = (eventsData || []) as unknown as EventRow[];

    // Build timeline items
    const items: TimelineItem[] = [];

    // Add events to timeline
    for (const event of events) {
      let label = event.event_type;

      // Generate human-readable labels
      if (event.event_type === "recording_status_changed") {
        label = `Status: ${event.from_status || "?"} → ${event.to_status || "?"}`;
      } else if (event.event_type === "claim") {
        label = `Claimed by ${event.actor || "unknown"} as ${event.details?.claim_role || "?"}`;
      } else if (event.event_type === "release") {
        label = `Released by ${event.actor || "unknown"}`;
      } else if (event.event_type === "handoff") {
        label = `Handoff: ${event.details?.from_role || "?"} → ${event.details?.to_role || "?"}`;
      } else if (event.event_type === "assigned") {
        label = `Assigned to ${event.details?.assigned_to || "?"} as ${event.details?.assigned_role || "?"}`;
      } else if (event.event_type === "assignment_reassigned") {
        label = `Reassigned: ${event.details?.from_role || "?"} → ${event.details?.to_role || "?"}`;
      } else if (event.event_type === "assignment_extended") {
        label = `TTL extended by ${event.details?.extended_by || "admin"}`;
      } else if (event.event_type === "assignment_completed") {
        label = `Assignment completed`;
      } else if (event.event_type === "assignment_expired") {
        label = `Assignment expired`;
      } else if (event.event_type === "force_release") {
        label = `Force released by admin`;
      }

      items.push({
        ts: event.created_at,
        type: "event",
        label,
        metadata: {
          event_id: event.id,
          event_type: event.event_type,
          actor: event.actor,
          from_status: event.from_status,
          to_status: event.to_status,
          correlation_id: event.correlation_id,
          details: event.details,
        },
      });
    }

    // Add current assignment snapshot if available
    if (hasAssignmentColumns && videoRow.assigned_to) {
      items.push({
        ts: videoRow.assigned_at || videoRow.updated_at || videoRow.created_at,
        type: "assignment",
        label: `Current assignment: ${videoRow.assigned_role || "?"} → ${videoRow.assignment_state || "?"}`,
        metadata: {
          assigned_to: videoRow.assigned_to,
          assigned_role: videoRow.assigned_role,
          assigned_at: videoRow.assigned_at,
          assigned_expires_at: videoRow.assigned_expires_at,
          assignment_state: videoRow.assignment_state,
          work_lane: videoRow.work_lane,
          work_priority: videoRow.work_priority,
        },
      });
    }

    // Add video creation snapshot
    items.push({
      ts: videoRow.created_at,
      type: "video_snapshot",
      label: "Video created",
      metadata: {
        recording_status: videoRow.recording_status,
        created_at: videoRow.created_at,
        updated_at: videoRow.updated_at,
        last_status_changed_at: videoRow.last_status_changed_at,
      },
    });

    // Sort by timestamp newest first
    items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

    // Limit to requested count
    const limitedItems = items.slice(0, limit);

    return NextResponse.json({
      ok: true,
      data: {
        video_id,
        video_snapshot: {
          recording_status: videoRow.recording_status,
          created_at: videoRow.created_at,
          updated_at: videoRow.updated_at,
          assignment_state: hasAssignmentColumns ? videoRow.assignment_state : null,
          assigned_to: hasAssignmentColumns ? videoRow.assigned_to : null,
          assigned_role: hasAssignmentColumns ? videoRow.assigned_role : null,
        },
        items: limitedItems,
      },
      meta: {
        item_count: limitedItems.length,
        limit,
      },
      correlation_id: correlationId,
    });

  } catch (err) {
    console.error("GET /api/admin/videos/[id]/timeline error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
