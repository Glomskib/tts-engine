import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
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
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Check admin role
  if (authContext.role !== "admin") {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate video_id format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!videoId || !uuidRegex.test(videoId)) {
    const err = apiError("BAD_REQUEST", "Invalid video ID format", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    const body = await request.json();
    const { project_id: projectId } = body;

    // project_id can be null to unassign
    if (projectId !== null && projectId !== undefined) {
      if (typeof projectId !== "string" || !uuidRegex.test(projectId)) {
        const err = apiError("BAD_REQUEST", "Invalid project_id format", 400);
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }
    }

    // Verify video exists
    const { data: video, error: videoError } = await supabaseAdmin
      .from("videos")
      .select("id")
      .eq("id", videoId)
      .single();

    if (videoError || !video) {
      const err = apiError("NOT_FOUND", "Video not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Get video's org
    const orgId = await getVideoOrgId(supabaseAdmin, videoId);
    if (!orgId) {
      const err = apiError("BAD_REQUEST", "Video is not assigned to an organization", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // If assigning to a project, verify the project exists and belongs to same org
    if (projectId) {
      const project = await getProjectById(supabaseAdmin, orgId, projectId);
      if (!project) {
        const err = apiError("NOT_FOUND", "Project not found or does not belong to the video's organization", 404);
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }

      if (project.is_archived) {
        const err = apiError("BAD_REQUEST", "Cannot assign video to an archived project", 400);
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
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
      const err = apiError("DB_ERROR", "Failed to set video project", 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
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
    const apiErr = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...apiErr.body, correlation_id: correlationId }, { status: apiErr.status });
  }
}
