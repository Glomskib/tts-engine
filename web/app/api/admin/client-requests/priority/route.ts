import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  setClientRequestPriority,
  getClientRequestByIdAdmin,
  RequestPriority,
} from "@/lib/client-requests";

export const runtime = "nodejs";

/**
 * POST /api/admin/client-requests/priority
 * Admin-only endpoint to set request priority.
 * Body: { request_id, org_id, priority: 'LOW' | 'NORMAL' | 'HIGH' }
 */
export async function POST(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get authentication context
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Admin-only
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  try {
    const body = await request.json();
    const { request_id, org_id, priority } = body;

    // Validate request_id
    if (!request_id || typeof request_id !== "string") {
      return createApiErrorResponse("BAD_REQUEST", "request_id is required", 400, correlationId);
    }

    // Validate org_id
    if (!org_id || typeof org_id !== "string") {
      return createApiErrorResponse("BAD_REQUEST", "org_id is required", 400, correlationId);
    }

    // Validate priority
    const validPriorities: RequestPriority[] = ["LOW", "NORMAL", "HIGH"];
    if (!priority || !validPriorities.includes(priority)) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "priority must be 'LOW', 'NORMAL', or 'HIGH'",
        400
      , correlationId);
    }

    // Verify request exists
    const existingRequest = await getClientRequestByIdAdmin(
      supabaseAdmin,
      request_id
    );
    if (!existingRequest || existingRequest.org_id !== org_id) {
      return createApiErrorResponse("NOT_FOUND", "Request not found", 404, correlationId);
    }

    // Set priority
    await setClientRequestPriority(supabaseAdmin, {
      request_id,
      org_id,
      priority,
      actor_user_id: authContext.user.id,
    });

    return NextResponse.json({
      ok: true,
      data: {
        request_id,
        priority,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("POST /api/admin/client-requests/priority error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
