import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { expireAllAssignments } from "@/lib/assignment-expiry";

export const runtime = "nodejs";

/**
 * POST /api/admin/sweep-assignments
 * Admin-only endpoint to force expiration of all expired assignments.
 * Returns counts: expired, untouched
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Admin-only endpoint
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required for sweep-assignments", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    const now = new Date();
    const result = await expireAllAssignments(now, correlationId);

    if (result.error) {
      const err = apiError("DB_ERROR", result.error, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    return NextResponse.json({
      ok: true,
      expired_count: result.expired_count,
      expired_ids: result.expired_ids,
      message: result.expired_count > 0
        ? `Expired ${result.expired_count} assignment(s)`
        : "No expired assignments found",
      correlation_id: correlationId,
    });

  } catch (err) {
    console.error("POST /api/admin/sweep-assignments error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
