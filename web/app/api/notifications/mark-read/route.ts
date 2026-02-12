import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
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
  const authContext = await getApiAuthContext(request);

  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const userId = authContext.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  const { ids, all } = body as { ids?: string[]; all?: boolean };

  // Validate input
  if (!all && (!ids || !Array.isArray(ids) || ids.length === 0)) {
    return createApiErrorResponse("BAD_REQUEST", "Must provide 'ids' array or 'all: true'", 400, correlationId);
  }

  try {
    const now = new Date().toISOString();

    if (all) {
      // Mark all unread notifications as read
      const { error } = await supabaseAdmin
        .from("notifications")
        .update({ is_read: true, read: true, read_at: now })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (error) {
        console.error("Mark all read error:", error);
        return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
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
        .update({ is_read: true, read: true, read_at: now })
        .eq("user_id", userId)
        .in("id", ids!)
        .eq("is_read", false);

      if (error) {
        console.error("Mark read error:", error);
        return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
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
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
