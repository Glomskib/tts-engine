import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
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
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json(
      { ...err.body, correlation_id: correlationId },
      { status: err.status }
    );
  }

  // Admin-only
  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json(
      { ...err.body, correlation_id: correlationId },
      { status: err.status }
    );
  }

  try {
    const body = await request.json();
    const { request_id, org_id, priority } = body;

    // Validate request_id
    if (!request_id || typeof request_id !== "string") {
      const err = apiError("BAD_REQUEST", "request_id is required", 400);
      return NextResponse.json(
        { ...err.body, correlation_id: correlationId },
        { status: err.status }
      );
    }

    // Validate org_id
    if (!org_id || typeof org_id !== "string") {
      const err = apiError("BAD_REQUEST", "org_id is required", 400);
      return NextResponse.json(
        { ...err.body, correlation_id: correlationId },
        { status: err.status }
      );
    }

    // Validate priority
    const validPriorities: RequestPriority[] = ["LOW", "NORMAL", "HIGH"];
    if (!priority || !validPriorities.includes(priority)) {
      const err = apiError(
        "BAD_REQUEST",
        "priority must be 'LOW', 'NORMAL', or 'HIGH'",
        400
      );
      return NextResponse.json(
        { ...err.body, correlation_id: correlationId },
        { status: err.status }
      );
    }

    // Verify request exists
    const existingRequest = await getClientRequestByIdAdmin(
      supabaseAdmin,
      request_id
    );
    if (!existingRequest || existingRequest.org_id !== org_id) {
      const err = apiError("NOT_FOUND", "Request not found", 404);
      return NextResponse.json(
        { ...err.body, correlation_id: correlationId },
        { status: err.status }
      );
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
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json(
      { ...error.body, correlation_id: correlationId },
      { status: error.status }
    );
  }
}
