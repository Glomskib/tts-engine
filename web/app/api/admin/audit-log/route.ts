import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

interface AuditRow {
  id: string;
  created_at: string;
  correlation_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  actor: string | null;
  summary: string;
  details: Record<string, unknown>;
}

/**
 * GET /api/admin/audit-log
 * Admin-only. Read-only audit log viewer with filtering.
 *
 * Query params:
 *   - limit: number (default: 200, max: 500)
 *   - event_type: filter by event type (optional)
 *   - entity_type: filter by entity type (optional)
 *   - entity_id: filter by entity ID (optional)
 *   - correlation_id: filter by correlation ID (optional)
 *   - actor: filter by actor user ID (optional)
 *   - from: ISO date string for start range (optional)
 *   - to: ISO date string for end range (optional)
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);

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

  // Parse query params
  const limitParam = parseInt(searchParams.get("limit") || "200", 10);
  const limit = Math.min(Math.max(1, limitParam), 500);

  const eventTypeFilter = searchParams.get("event_type") || null;
  const entityTypeFilter = searchParams.get("entity_type") || null;
  const entityIdFilter = searchParams.get("entity_id") || null;
  const correlationIdFilter = searchParams.get("correlation_id") || null;
  const actorFilter = searchParams.get("actor") || null;
  const fromFilter = searchParams.get("from") || null;
  const toFilter = searchParams.get("to") || null;

  try {
    let query = supabaseAdmin
      .from("audit_log")
      .select("id,created_at,correlation_id,event_type,entity_type,entity_id,actor,summary,details")
      .order("created_at", { ascending: false });

    // Apply filters
    if (eventTypeFilter) {
      query = query.eq("event_type", eventTypeFilter);
    }

    if (entityTypeFilter) {
      query = query.eq("entity_type", entityTypeFilter);
    }

    if (entityIdFilter) {
      query = query.eq("entity_id", entityIdFilter);
    }

    if (correlationIdFilter) {
      query = query.eq("correlation_id", correlationIdFilter);
    }

    if (actorFilter) {
      query = query.eq("actor", actorFilter);
    }

    if (fromFilter) {
      query = query.gte("created_at", fromFilter);
    }

    if (toFilter) {
      query = query.lte("created_at", toFilter);
    }

    query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error("GET /api/admin/audit-log error:", error);
      const err = apiError("DB_ERROR", error.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const rows = (data || []) as AuditRow[];

    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data: {
        rows,
        count: rows.length,
      },
    });

    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (err) {
    console.error("GET /api/admin/audit-log error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
