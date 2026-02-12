import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { PROJECT_EVENT_TYPES, getProjectById } from "@/lib/client-projects";
import { getVideoOrgId } from "@/lib/client-org";

export const runtime = "nodejs";

/**
 * POST /api/admin/videos/[video_id]/set-project
 * Assign a video to a project
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ video_id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { video_id: videoId } = await params;

  // Require authentication
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Check admin role
  if (authContext.role !== "admin") {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  // Validate video_id format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!videoId || !uuidRegex.test(videoId)) {
    return createApiErrorResponse("BAD_REQUEST", "Invalid video ID format", 400, correlationId);
  }

  try {
    const body = await request.json();
    const { project_id: projectId } = body;

    // project_id can be null to unassign
    if (projectId !== null && projectId !== undefined) {
      if (typeof projectId !== "string" || !uuidRegex.test(projectId)) {
        return createApiErrorResponse("BAD_REQUEST", "Invalid project_id format", 400, correlationId);
      }
    }

    // Verify video exists
    const { data: video, error: videoError } = await supabaseAdmin
      .from("videos")
      .select("id")
      .eq("id", videoId)
      .single();

    if (videoError || !video) {
      return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
    }

    // Get video's org
    const orgId = await getVideoOrgId(supabaseAdmin, videoId);
    if (!orgId) {
      return createApiErrorResponse("BAD_REQUEST", "Video is not assigned to an organization", 400, correlationId);
    }

    // If assigning to a project, verify the project exists and belongs to same org
    if (projectId) {
      const project = await getProjectById(supabaseAdmin, orgId, projectId);
      if (!project) {
        return createApiErrorResponse("NOT_FOUND", "Project not found or does not belong to the video's organization", 404, correlationId);
      }

      if (project.is_archived) {
        return createApiErrorResponse("BAD_REQUEST", "Cannot assign video to an archived project", 400, correlationId);
      }
    }

    // Insert video_project_set event
    const { error: eventError } = await supabaseAdmin
      .from("video_events")
      .insert({
        video_id: videoId,
        event_type: PROJECT_EVENT_TYPES.VIDEO_PROJECT_SET,
        user_id: authContext.user.id,
        details: {
          org_id: orgId,
          project_id: projectId || null,
          set_by_user_id: authContext.user.id,
        },
      });

    if (eventError) {
      console.error("[admin/videos/set-project] Event insert error:", eventError);
      return createApiErrorResponse("DB_ERROR", "Failed to set video project", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: {
        video_id: videoId,
        project_id: projectId || null,
        org_id: orgId,
      },
    });
  } catch (err) {
    console.error("[admin/videos/set-project] Error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
