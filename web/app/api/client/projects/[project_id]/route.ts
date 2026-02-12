import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getPrimaryClientOrgForUser } from "@/lib/client-org";
import { getProjectById, listProjectVideos } from "@/lib/client-projects";

export const runtime = "nodejs";

// Client-safe video fields
const CLIENT_SAFE_SELECT = "id,status,recording_status,created_at,last_status_changed_at,posted_url";

/**
 * GET /api/client/projects/[project_id]
 * Get project details with videos
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ project_id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { project_id: projectId } = await params;

  // Require authentication
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Validate project ID format
  if (!projectId || !projectId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    return createApiErrorResponse("BAD_REQUEST", "Invalid project ID format", 400, correlationId);
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
    // Get project (verifies it belongs to org)
    const project = await getProjectById(supabaseAdmin, membership.org_id, projectId);
    if (!project) {
      return createApiErrorResponse("NOT_FOUND", "Project not found", 404, correlationId);
    }

    // Get video IDs in this project
    const videoIds = await listProjectVideos(supabaseAdmin, membership.org_id, projectId);

    // Fetch video details
    let videos: Array<{
      id: string;
      status: string;
      recording_status: string;
      created_at: string;
      last_status_changed_at: string | null;
      posted_url: string | null;
    }> = [];

    if (videoIds.length > 0) {
      const { data: videoData, error: videoError } = await supabaseAdmin
        .from("videos")
        .select(CLIENT_SAFE_SELECT)
        .in("id", videoIds)
        .order("created_at", { ascending: false });

      if (!videoError && videoData) {
        videos = videoData.map((v) => ({
          id: v.id,
          status: v.status,
          recording_status: v.recording_status || "NOT_RECORDED",
          created_at: v.created_at,
          last_status_changed_at: v.last_status_changed_at,
          posted_url: v.posted_url,
        }));
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        project: {
          project_id: project.project_id,
          project_name: project.project_name,
          created_at: project.created_at,
          is_archived: project.is_archived,
        },
        videos,
        video_count: videos.length,
      },
    });
  } catch (err) {
    console.error("[client/projects/[id]] Error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
