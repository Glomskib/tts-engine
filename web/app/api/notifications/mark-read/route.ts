import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

/**
 * POST /api/notifications/mark-read
 * Marks notifications as read for the current user
 * Body: { ids: string[] } OR { all: true }
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get auth context
  const authContext = await getApiAuthContext();

  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const userId = authContext.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const { ids, all } = body as { ids?: string[]; all?: boolean };

  // Validate input
  if (!all && (!ids || !Array.isArray(ids) || ids.length === 0)) {
    const err = apiError("BAD_REQUEST", "Must provide 'ids' array or 'all: true'", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    const now = new Date().toISOString();

    if (all) {
      // Mark all unread notifications as read
      const { error } = await supabaseAdmin
        .from("notifications")
        .update({ is_read: true, read_at: now })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (error) {
        console.error("Mark all read error:", error);
        const err = apiError("DB_ERROR", error.message, 500);
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }

      return NextResponse.json({
        ok: true,
        message: "All notifications marked as read",
        correlation_id: correlationId,
      });
    } else {
      // Mark specific notifications as read (only if owned by user)
      const { error, count } = await supabaseAdmin
        .from("notifications")
        .update({ is_read: true, read_at: now })
        .eq("user_id", userId)
        .in("id", ids!)
        .eq("is_read", false);

      if (error) {
        console.error("Mark read error:", error);
        const err = apiError("DB_ERROR", error.message, 500);
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }

      return NextResponse.json({
        ok: true,
        message: `Marked ${count || 0} notification(s) as read`,
        marked_count: count || 0,
        correlation_id: correlationId,
      });
    }
  } catch (err) {
    console.error("POST /api/notifications/mark-read error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
