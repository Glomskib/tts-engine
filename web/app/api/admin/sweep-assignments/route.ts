import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
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
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required for sweep-assignments", 403, correlationId);
  }

  try {
    const now = new Date();
    const result = await expireAllAssignments(now, correlationId);

    if (result.error) {
      return createApiErrorResponse("DB_ERROR", result.error, 500, correlationId);
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
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
