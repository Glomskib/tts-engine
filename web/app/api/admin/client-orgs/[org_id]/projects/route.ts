import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { listOrgProjects } from "@/lib/client-projects";

export const runtime = "nodejs";

/**
 * GET /api/admin/client-orgs/[org_id]/projects
 * List all projects for an organization (admin only)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ org_id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { org_id: orgId } = await params;

  // Require authentication
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Check admin role
  if (authContext.role !== "admin") {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  // Validate org_id format
  if (!orgId || !orgId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    return createApiErrorResponse("BAD_REQUEST", "Invalid organization ID format", 400, correlationId);
  }

  try {
    // Get projects including archived ones for admin view
    const projects = await listOrgProjects(supabaseAdmin, orgId, { includeArchived: true });

    // Map to admin-friendly shape
    const adminProjects = projects.map((p) => ({
      project_id: p.project_id,
      project_name: p.project_name,
      video_count: p.video_count,
      created_at: p.created_at,
      is_archived: p.is_archived,
      archived_at: p.archived_at,
    }));

    return NextResponse.json({
      ok: true,
      data: adminProjects,
      meta: {
        count: adminProjects.length,
        org_id: orgId,
      },
    });
  } catch (err) {
    console.error("[admin/client-orgs/projects] Error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
