import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { getPrimaryClientOrgForUser } from "@/lib/client-org";
import { createClientRequest, RequestType } from "@/lib/client-requests";

export const runtime = "nodejs";

/**
 * POST /api/client/requests/create
 * Create a new content request.
 *
 * Body:
 * - request_type: 'AI_CONTENT' | 'UGC_EDIT'
 * - title: string (required)
 * - brief: string (required)
 * - project_id?: string
 * - product_url?: string (for AI_CONTENT)
 * - ugc_links?: string[] (required for UGC_EDIT, min 1)
 * - notes?: string
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

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

  try {
    const body = await request.json();
    const { request_type, title, brief, project_id, product_url, ugc_links, notes } = body;

    // Validate request_type
    const validTypes: RequestType[] = ["AI_CONTENT", "UGC_EDIT"];
    if (!request_type || !validTypes.includes(request_type)) {
      const err = apiError("BAD_REQUEST", "request_type must be 'AI_CONTENT' or 'UGC_EDIT'", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Validate title
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      const err = apiError("BAD_REQUEST", "title is required", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    const trimmedTitle = title.trim();
    if (trimmedTitle.length > 200) {
      const err = apiError("BAD_REQUEST", "title must be 200 characters or less", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Validate brief
    if (!brief || typeof brief !== "string" || brief.trim().length === 0) {
      const err = apiError("BAD_REQUEST", "brief is required", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    const trimmedBrief = brief.trim();
    if (trimmedBrief.length > 5000) {
      const err = apiError("BAD_REQUEST", "brief must be 5000 characters or less", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Validate UGC_EDIT specific requirements
    if (request_type === "UGC_EDIT") {
      if (!ugc_links || !Array.isArray(ugc_links) || ugc_links.length === 0) {
        const err = apiError("BAD_REQUEST", "ugc_links is required for UGC_EDIT requests (at least one link)", 400);
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }

      // Validate each link is a non-empty string
      for (let i = 0; i < ugc_links.length; i++) {
        if (typeof ugc_links[i] !== "string" || ugc_links[i].trim().length === 0) {
          const err = apiError("BAD_REQUEST", `ugc_links[${i}] must be a non-empty string`, 400);
          return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
        }
      }
    }

    // Create the request
    const result = await createClientRequest(supabaseAdmin, {
      org_id: membership.org_id,
      project_id: project_id || undefined,
      request_type,
      title: trimmedTitle,
      brief: trimmedBrief,
      product_url: product_url?.trim() || undefined,
      ugc_links: ugc_links?.map((l: string) => l.trim()).filter((l: string) => l.length > 0) || undefined,
      notes: notes?.trim() || undefined,
      requested_by_user_id: authContext.user.id,
      requested_by_email: authContext.user.email || undefined,
    });

    return NextResponse.json({
      ok: true,
      data: {
        request_id: result.request_id,
      },
    });
  } catch (err) {
    console.error("[client/requests/create] Error:", err);
    const apiErr = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...apiErr.body, correlation_id: correlationId }, { status: apiErr.status });
  }
}
