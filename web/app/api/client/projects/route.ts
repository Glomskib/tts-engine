import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getPrimaryClientOrgForUser } from "@/lib/client-org";
import { listOrgProjects } from "@/lib/client-projects";

export const runtime = "nodejs";

/**
 * GET /api/client/projects
 * List projects for the current user's organization
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
    // Get projects (not including archived by default)
    const projects = await listOrgProjects(supabaseAdmin, membership.org_id, { includeArchived: false });

    // Map to client-safe shape
    const clientProjects = projects.map((p) => ({
      project_id: p.project_id,
      project_name: p.project_name,
      video_count: p.video_count,
      created_at: p.created_at,
    }));

    return NextResponse.json({
      ok: true,
      data: clientProjects,
      meta: {
        count: clientProjects.length,
        org_id: membership.org_id,
      },
    });
  } catch (err) {
    console.error("[client/projects] Error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
