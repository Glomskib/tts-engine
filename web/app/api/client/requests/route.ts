import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getPrimaryClientOrgForUser } from "@/lib/client-org";
import { listClientRequestsForOrg, RequestStatus } from "@/lib/client-requests";

export const runtime = "nodejs";

/**
 * GET /api/client/requests
 * List requests for the current user's organization.
 * Query params: project_id, status
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Require authentication
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Get user's primary organization
  const membership = await getPrimaryClientOrgForUser(supabaseAdmin, authContext.user.id);
  if (!membership) {
    return NextResponse.json({
      ok: false,
      error: "client_org_required",
      message: "Your portal is not yet connected to an organization. Contact support.",
      correlation_id: correlationId,
    }, { status: 403 });
  }

  try {
    // Parse query params
    const url = new URL(request.url);
    const projectId = url.searchParams.get("project_id") || undefined;
    const status = url.searchParams.get("status") as RequestStatus | undefined;

    // Validate status if provided
    const validStatuses: RequestStatus[] = ["SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED", "CONVERTED"];
    if (status && !validStatuses.includes(status)) {
      return createApiErrorResponse("BAD_REQUEST", "Invalid status parameter", 400, correlationId);
    }

    // Get requests
    const requests = await listClientRequestsForOrg(supabaseAdmin, membership.org_id, {
      project_id: projectId,
      status,
    });

    // Return client-safe data (exclude internal fields if any)
    const clientRequests = requests.map((r) => ({
      request_id: r.request_id,
      project_id: r.project_id,
      request_type: r.request_type,
      title: r.title,
      brief: r.brief,
      product_url: r.product_url,
      ugc_links: r.ugc_links,
      notes: r.notes,
      status: r.status,
      status_reason: r.status_reason,
      video_id: r.video_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return NextResponse.json({
      ok: true,
      data: clientRequests,
    });
  } catch (err) {
    console.error("[client/requests] Error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
