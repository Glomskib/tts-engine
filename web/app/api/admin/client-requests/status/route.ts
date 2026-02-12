import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
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
    const { request_id, org_id, status, reason } = body;

    // Validate request_id
    if (!request_id || typeof request_id !== "string") {
      return createApiErrorResponse("BAD_REQUEST", "request_id is required", 400, correlationId);
    }

    // Validate org_id
    if (!org_id || typeof org_id !== "string") {
      return createApiErrorResponse("BAD_REQUEST", "org_id is required", 400, correlationId);
    }

    // Validate status
    const validStatuses = ["IN_REVIEW", "APPROVED", "REJECTED"];
    if (!status || !validStatuses.includes(status)) {
      return createApiErrorResponse("BAD_REQUEST", "status must be 'IN_REVIEW', 'APPROVED', or 'REJECTED'", 400, correlationId);
    }

    // Verify request exists
    const existingRequest = await getClientRequestByIdAdmin(supabaseAdmin, request_id);
    if (!existingRequest || existingRequest.org_id !== org_id) {
      return createApiErrorResponse("NOT_FOUND", "Request not found", 404, correlationId);
    }

    // Check if already converted
    if (existingRequest.status === "CONVERTED") {
      return createApiErrorResponse("CONFLICT", "Cannot change status of converted request", 409, correlationId);
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
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
