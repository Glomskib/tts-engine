import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { getPrimaryClientOrgForUser } from "@/lib/client-org";
import { getClientRequestById } from "@/lib/client-requests";

export const runtime = "nodejs";

/**
 * GET /api/client/requests/[request_id]
 * Get a single request by ID for the current user's organization.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ request_id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { request_id: requestId } = await params;

  // Require authentication
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
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

  // Validate request_id format
  if (!requestId || !requestId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    const err = apiError("BAD_REQUEST", "Invalid request_id format", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    // Get the request (org-scoped)
    const clientRequest = await getClientRequestById(supabaseAdmin, membership.org_id, requestId);

    if (!clientRequest) {
      const err = apiError("NOT_FOUND", "Request not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Return client-safe data
    return NextResponse.json({
      ok: true,
      data: {
        request_id: clientRequest.request_id,
        project_id: clientRequest.project_id,
        request_type: clientRequest.request_type,
        title: clientRequest.title,
        brief: clientRequest.brief,
        product_url: clientRequest.product_url,
        ugc_links: clientRequest.ugc_links,
        notes: clientRequest.notes,
        status: clientRequest.status,
        status_reason: clientRequest.status_reason,
        video_id: clientRequest.video_id,
        created_at: clientRequest.created_at,
        updated_at: clientRequest.updated_at,
      },
    });
  } catch (err) {
    console.error("[client/requests/[id]] Error:", err);
    const apiErr = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...apiErr.body, correlation_id: correlationId }, { status: apiErr.status });
  }
}
