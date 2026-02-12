import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { computeSlaInfo } from "@/lib/execution-stages";

export const runtime = "nodejs";

type SortOption = "expires_soon" | "priority" | "newest";

interface AssignmentRow {
  id: string;
  recording_status: string | null;
  assignment_state: string | null;
  assigned_to: string | null;
  assigned_role: string | null;
  assigned_at: string | null;
  assigned_expires_at: string | null;
  work_lane: string | null;
  work_priority: number | null;
  last_status_changed_at: string | null;
}

/**
 * GET /api/admin/assignments
 * Admin-only. Returns assignment data with filters and sorting.
 * Query params:
 *   - role: recorder|editor|uploader|any (default: any)
 *   - state: ASSIGNED|EXPIRED|COMPLETED|UNASSIGNED|any (default: any)
 *   - assigned_to: user_id or "any" (default: any)
 *   - sort: expires_soon|priority|newest (default: expires_soon)
 *   - limit: number (default: 100, max: 500)
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
  const roleFilter = searchParams.get("role") || "any";
  const stateFilter = searchParams.get("state") || "any";
  const assignedToFilter = searchParams.get("assigned_to") || "any";
  const sortParam = (searchParams.get("sort") || "expires_soon") as SortOption;
  const limitParam = parseInt(searchParams.get("limit") || "100", 10);
  const limit = Math.min(Math.max(1, limitParam), 500);

  try {
    const existingColumns = await getVideosColumns();
    const hasAssignmentColumns = existingColumns.has("assignment_state") && existingColumns.has("assigned_expires_at");

    if (!hasAssignmentColumns) {
      return NextResponse.json({
        ok: true,
        data: [],
        message: "Assignment columns not available (migration 019 not applied)",
        correlation_id: correlationId,
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // Build query
    const selectCols = "id,recording_status,assignment_state,assigned_to,assigned_role,assigned_at,assigned_expires_at,work_lane,work_priority,last_status_changed_at";

    let query = supabaseAdmin.from("videos").select(selectCols);

    // Apply filters
    if (roleFilter !== "any") {
      query = query.eq("assigned_role", roleFilter);
    }

    if (stateFilter !== "any") {
      query = query.eq("assignment_state", stateFilter);
    } else {
      // By default, exclude UNASSIGNED to focus on meaningful data
      query = query.neq("assignment_state", "UNASSIGNED");
    }

    if (assignedToFilter !== "any") {
      query = query.eq("assigned_to", assignedToFilter);
    }

    // Apply sorting
    switch (sortParam) {
      case "expires_soon":
        query = query.order("assigned_expires_at", { ascending: true, nullsFirst: false });
        break;
      case "priority":
        query = query.order("work_priority", { ascending: false, nullsFirst: false });
        break;
      case "newest":
        query = query.order("assigned_at", { ascending: false, nullsFirst: false });
        break;
    }

    query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error("GET /api/admin/assignments error:", error);
      return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
    }

    const rows = (data || []) as unknown as AssignmentRow[];

    // Enrich with computed fields
    const enrichedData = rows.map((row) => {
      const expiresAt = row.assigned_expires_at ? new Date(row.assigned_expires_at) : null;
      const timeLeftMinutes = expiresAt ? Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60)) : null;

      // Compute SLA info
      const slaInfo = computeSlaInfo(row.recording_status, row.last_status_changed_at, now);

      return {
        video_id: row.id,
        recording_status: row.recording_status || "NOT_RECORDED",
        assignment_state: row.assignment_state || "UNASSIGNED",
        assigned_to: row.assigned_to,
        assigned_role: row.assigned_role,
        assigned_at: row.assigned_at,
        assigned_expires_at: row.assigned_expires_at,
        time_left_minutes: timeLeftMinutes,
        is_expired: timeLeftMinutes !== null && timeLeftMinutes < 0,
        is_expiring_soon: timeLeftMinutes !== null && timeLeftMinutes >= 0 && timeLeftMinutes <= 30,
        work_lane: row.work_lane,
        work_priority: row.work_priority,
        sla_status: slaInfo.sla_status,
        priority_score: slaInfo.priority_score,
      };
    });

    return NextResponse.json({
      ok: true,
      data: enrichedData,
      meta: {
        count: enrichedData.length,
        filters: { role: roleFilter, state: stateFilter, assigned_to: assignedToFilter },
        sort: sortParam,
        generated_at: nowIso,
      },
      correlation_id: correlationId,
    });

  } catch (err) {
    console.error("GET /api/admin/assignments error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
