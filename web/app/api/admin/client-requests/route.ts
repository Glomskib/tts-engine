import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listAllClientRequests, RequestStatus, RequestType } from "@/lib/client-requests";
import { getClientOrgById } from "@/lib/client-org";

export const runtime = "nodejs";

/**
 * GET /api/admin/client-requests
 * Admin-only endpoint to list all client requests.
 * Query params: org_id, status, request_type
 */
export async function GET(request: Request) {
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
    // Parse query params
    const url = new URL(request.url);
    const orgId = url.searchParams.get("org_id") || undefined;
    const status = url.searchParams.get("status") as RequestStatus | undefined;
    const requestType = url.searchParams.get("request_type") as RequestType | undefined;

    // Validate status if provided
    const validStatuses: RequestStatus[] = ["SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED", "CONVERTED"];
    if (status && !validStatuses.includes(status)) {
      return createApiErrorResponse("BAD_REQUEST", "Invalid status parameter", 400, correlationId);
    }

    // Validate request_type if provided
    const validTypes: RequestType[] = ["AI_CONTENT", "UGC_EDIT"];
    if (requestType && !validTypes.includes(requestType)) {
      return createApiErrorResponse("BAD_REQUEST", "Invalid request_type parameter", 400, correlationId);
    }

    // Get requests
    const requests = await listAllClientRequests(supabaseAdmin, {
      org_id: orgId,
      status,
      request_type: requestType,
    });

    // Enrich with org names
    const orgNameCache = new Map<string, string>();
    const enrichedRequests = await Promise.all(
      requests.map(async (r) => {
        let orgName = orgNameCache.get(r.org_id);
        if (!orgName) {
          const org = await getClientOrgById(supabaseAdmin, r.org_id);
          orgName = org?.org_name || r.org_id;
          orgNameCache.set(r.org_id, orgName);
        }

        return {
          request_id: r.request_id,
          org_id: r.org_id,
          org_name: orgName,
          project_id: r.project_id,
          request_type: r.request_type,
          title: r.title,
          brief: r.brief,
          product_url: r.product_url,
          ugc_links: r.ugc_links,
          notes: r.notes,
          requested_by_user_id: r.requested_by_user_id,
          requested_by_email: r.requested_by_email,
          status: r.status,
          status_reason: r.status_reason,
          video_id: r.video_id,
          created_at: r.created_at,
          updated_at: r.updated_at,
        };
      })
    );

    return NextResponse.json({
      ok: true,
      data: enrichedRequests,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/admin/client-requests error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
