import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
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
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Check admin role
  if (authContext.role !== "admin") {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate UUIDs
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!orgId || !uuidRegex.test(orgId)) {
    const err = apiError("BAD_REQUEST", "Invalid organization ID format", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }
  if (!projectId || !uuidRegex.test(projectId)) {
    const err = apiError("BAD_REQUEST", "Invalid project ID format", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    // Verify project exists and belongs to org
    const project = await getProjectById(supabaseAdmin, orgId, projectId);
    if (!project) {
      const err = apiError("NOT_FOUND", "Project not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
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

    // Insert archive event
    const { error: eventError } = await supabaseAdmin
      .from("video_events")
      .insert({
        video_id: null, // Project-level event
        event_type: PROJECT_EVENT_TYPES.PROJECT_ARCHIVED,
        user_id: authContext.user.id,
        details: {
          org_id: orgId,
          project_id: projectId,
          archived_by_user_id: authContext.user.id,
        },
      });

    if (eventError) {
      console.error("[admin/projects/archive] Event insert error:", eventError);
      const err = apiError("DB_ERROR", "Failed to archive project", 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
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
    const apiErr = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...apiErr.body, correlation_id: correlationId }, { status: apiErr.status });
  }
}
