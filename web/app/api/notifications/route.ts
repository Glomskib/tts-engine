import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/notifications
 * Returns notifications for the current user
 * Query params:
 *   - limit: max number to return (default 50, max 100)
 *   - unread_only: "true" to filter to unread only
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  // Get auth context
  const authContext = await getApiAuthContext();

  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const userId = authContext.user.id;

  // Parse query params
  const limitParam = searchParams.get("limit");
  const unreadOnlyParam = searchParams.get("unread_only");

  let limit = 50;
  if (limitParam) {
    const parsedLimit = parseInt(limitParam, 10);
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
      limit = Math.min(parsedLimit, 100);
    }
  }

  const unreadOnly = unreadOnlyParam === "true";

  try {
    let query = supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq("is_read", false);
    }

    const { data, error } = await query;

    if (error) {
      console.error("GET /api/notifications error:", error);
      const err = apiError("DB_ERROR", error.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Count unread
    const { count: unreadCount } = await supabaseAdmin
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    return NextResponse.json({
      ok: true,
      data: data || [],
      meta: {
        unread_count: unreadCount || 0,
        limit,
        unread_only: unreadOnly,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/notifications error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
