import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { PROJECT_EVENT_TYPES, getProjectById } from "@/lib/client-projects";

export const runtime = "nodejs";

/**
 * POST /api/admin/client-orgs/[org_id]/projects/[project_id]/archive
 * Archive a project
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ org_id: string; project_id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { org_id: orgId, project_id: projectId } = await params;

  // Require authentication
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Check admin role
  if (authContext.role !== "admin") {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  // Validate UUIDs
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!orgId || !uuidRegex.test(orgId)) {
    return createApiErrorResponse("BAD_REQUEST", "Invalid organization ID format", 400, correlationId);
  }
  if (!projectId || !uuidRegex.test(projectId)) {
    return createApiErrorResponse("BAD_REQUEST", "Invalid project ID format", 400, correlationId);
  }

  try {
    // Verify project exists and belongs to org
    const project = await getProjectById(supabaseAdmin, orgId, projectId);
    if (!project) {
      return createApiErrorResponse("NOT_FOUND", "Project not found", 404, correlationId);
    }

    if (project.is_archived) {
      return NextResponse.json({
        ok: true,
        message: "Project is already archived",
        data: {
          project_id: projectId,
          is_archived: true,
        },
      });
    }

    // Insert archive event in events_log
    const { error: eventError } = await supabaseAdmin
      .from("events_log")
      .insert({
        entity_type: "client_project",
        entity_id: projectId,
        event_type: PROJECT_EVENT_TYPES.PROJECT_ARCHIVED,
        payload: {
          org_id: orgId,
          archived_by_user_id: authContext.user.id,
        },
      });

    if (eventError) {
      console.error("[admin/projects/archive] Event insert error:", eventError);
      return createApiErrorResponse("DB_ERROR", "Failed to archive project", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: {
        project_id: projectId,
        is_archived: true,
      },
    });
  } catch (err) {
    console.error("[admin/projects/archive] Error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
