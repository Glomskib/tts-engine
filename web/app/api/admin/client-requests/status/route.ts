import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { setClientRequestStatus, getClientRequestByIdAdmin } from "@/lib/client-requests";
import { getClientOrgById } from "@/lib/client-org";
import { sendRequestStatusEmail } from "@/lib/client-email-notifications";

export const runtime = "nodejs";

/**
 * POST /api/admin/client-requests/status
 * Admin-only endpoint to set request status.
 * Body: { request_id, org_id, status: 'IN_REVIEW' | 'APPROVED' | 'REJECTED', reason? }
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get authentication context
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Admin-only
  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    const body = await request.json();
    const { request_id, org_id, status, reason } = body;

    // Validate request_id
    if (!request_id || typeof request_id !== "string") {
      const err = apiError("BAD_REQUEST", "request_id is required", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Validate org_id
    if (!org_id || typeof org_id !== "string") {
      const err = apiError("BAD_REQUEST", "org_id is required", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Validate status
    const validStatuses = ["IN_REVIEW", "APPROVED", "REJECTED"];
    if (!status || !validStatuses.includes(status)) {
      const err = apiError("BAD_REQUEST", "status must be 'IN_REVIEW', 'APPROVED', or 'REJECTED'", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Verify request exists
    const existingRequest = await getClientRequestByIdAdmin(supabaseAdmin, request_id);
    if (!existingRequest || existingRequest.org_id !== org_id) {
      const err = apiError("NOT_FOUND", "Request not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Check if already converted
    if (existingRequest.status === "CONVERTED") {
      const err = apiError("CONFLICT", "Cannot change status of converted request", 409);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Set status
    await setClientRequestStatus(supabaseAdmin, {
      request_id,
      org_id,
      status,
      reason: reason?.trim() || undefined,
      actor_user_id: authContext.user.id,
    });

    // Send email notification for APPROVED/REJECTED (fail-safe)
    let emailResult = null;
    if ((status === "APPROVED" || status === "REJECTED") && existingRequest.requested_by_email) {
      const org = await getClientOrgById(supabaseAdmin, org_id);
      const portalUrl = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/client/requests/${request_id}`
        : undefined;

      emailResult = await sendRequestStatusEmail({
        recipientEmail: existingRequest.requested_by_email,
        requestId: request_id,
        requestTitle: existingRequest.title,
        requestType: existingRequest.request_type,
        orgName: org?.org_name || "Your Organization",
        newStatus: status as "APPROVED" | "REJECTED",
        reason: reason?.trim(),
        portalUrl,
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        request_id,
        status,
        email_sent: emailResult?.sent,
        email_skipped: emailResult?.skipped,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("POST /api/admin/client-requests/status error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
