import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getClientRequestByIdAdmin,
  convertClientRequestToVideo,
  REQUEST_EVENT_TYPES,
} from "@/lib/client-requests";
import { CLIENT_ORG_EVENT_TYPES, getClientOrgById } from "@/lib/client-org";
import { PROJECT_EVENT_TYPES } from "@/lib/client-projects";
import { getVideosColumns } from "@/lib/videosSchema";
import { randomUUID } from "crypto";
import { sendRequestConvertedEmail } from "@/lib/client-email-notifications";

export const runtime = "nodejs";

/**
 * POST /api/admin/client-requests/convert
 * Admin-only endpoint to convert an approved request into a pipeline video.
 * Body: { request_id, org_id }
 */
export async function POST(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get authentication context
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json(
      { ...err.body, correlation_id: correlationId },
      { status: err.status }
    );
  }

  // Admin-only
  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json(
      { ...err.body, correlation_id: correlationId },
      { status: err.status }
    );
  }

  try {
    const body = await request.json();
    const { request_id, org_id } = body;

    // Validate request_id
    if (!request_id || typeof request_id !== "string") {
      const err = apiError("BAD_REQUEST", "request_id is required", 400);
      return NextResponse.json(
        { ...err.body, correlation_id: correlationId },
        { status: err.status }
      );
    }

    // Validate org_id
    if (!org_id || typeof org_id !== "string") {
      const err = apiError("BAD_REQUEST", "org_id is required", 400);
      return NextResponse.json(
        { ...err.body, correlation_id: correlationId },
        { status: err.status }
      );
    }

    // Get the request
    const clientRequest = await getClientRequestByIdAdmin(supabaseAdmin, request_id);
    if (!clientRequest || clientRequest.org_id !== org_id) {
      const err = apiError("NOT_FOUND", "Request not found", 404);
      return NextResponse.json(
        { ...err.body, correlation_id: correlationId },
        { status: err.status }
      );
    }

    // Must be APPROVED to convert
    if (clientRequest.status !== "APPROVED") {
      const err = apiError(
        "CONFLICT",
        "Request must be APPROVED before conversion",
        409
      );
      return NextResponse.json(
        { ...err.body, correlation_id: correlationId },
        { status: err.status }
      );
    }

    // Get existing video columns from schema
    const existingColumns = await getVideosColumns();

    // Build video insert payload
    // For client requests, we generate a unique variant_id prefixed with "request-"
    const variantId = `request-${request_id.slice(0, 8)}`;

    // Determine google_drive_url:
    // - For UGC_EDIT: use first ugc_link
    // - For AI_CONTENT: use placeholder
    let driveUrl = "pending://client-request";
    if (
      clientRequest.request_type === "UGC_EDIT" &&
      clientRequest.ugc_links &&
      clientRequest.ugc_links.length > 0
    ) {
      driveUrl = clientRequest.ugc_links[0];
    }

    const insertPayload: Record<string, unknown> = {
      account_id: org_id, // Use org_id as account_id for client requests
      variant_id: variantId,
      google_drive_url: driveUrl,
      status: "needs_edit", // Default pipeline status
    };

    // Set recording_status to NOT_RECORDED if column exists
    if (existingColumns.has("recording_status")) {
      insertPayload.recording_status = "NOT_RECORDED";
    }

    // For AI_CONTENT, set script_locked_text to brief
    if (clientRequest.request_type === "AI_CONTENT") {
      if (existingColumns.has("script_locked_text")) {
        insertPayload.script_locked_text = `AI_REQUEST: ${clientRequest.brief}`;
      }
    }

    // Add final_video_url if column exists
    if (existingColumns.has("final_video_url")) {
      insertPayload.final_video_url = driveUrl;
    }

    // Create the video
    const { data: videoData, error: videoError } = await supabaseAdmin
      .from("videos")
      .insert(insertPayload)
      .select()
      .single();

    if (videoError) {
      console.error("Convert request - video insert error:", videoError);
      const err = apiError("DB_ERROR", "Failed to create video", 500);
      return NextResponse.json(
        { ...err.body, correlation_id: correlationId },
        { status: err.status }
      );
    }

    const videoId = videoData.id;

    // Emit video_client_org_set event to scope video to org
    await supabaseAdmin.from("video_events").insert({
      video_id: videoId,
      event_type: CLIENT_ORG_EVENT_TYPES.VIDEO_ORG_SET,
      actor_id: authContext.user.id,
      correlation_id: correlationId,
      details: {
        org_id: clientRequest.org_id,
        set_by_user_id: authContext.user.id,
      },
    });

    // If request has project_id, emit video_project_set event
    if (clientRequest.project_id) {
      await supabaseAdmin.from("video_events").insert({
        video_id: videoId,
        event_type: PROJECT_EVENT_TYPES.VIDEO_PROJECT_SET,
        actor_id: authContext.user.id,
        correlation_id: correlationId,
        details: {
          org_id: clientRequest.org_id,
          project_id: clientRequest.project_id,
          set_by_user_id: authContext.user.id,
        },
      });
    }

    // Emit client_request_attached event on video for timeline
    await supabaseAdmin.from("video_events").insert({
      video_id: videoId,
      event_type: "client_request_attached",
      actor_id: authContext.user.id,
      correlation_id: correlationId,
      details: {
        request_id: clientRequest.request_id,
        org_id: clientRequest.org_id,
        request_type: clientRequest.request_type,
        title: clientRequest.title,
        brief: clientRequest.brief,
        product_url: clientRequest.product_url,
        ugc_links: clientRequest.ugc_links,
        notes: clientRequest.notes,
        requested_by_user_id: clientRequest.requested_by_user_id,
        requested_by_email: clientRequest.requested_by_email,
      },
    });

    // Emit create event for video
    await supabaseAdmin.from("video_events").insert({
      video_id: videoId,
      event_type: "create",
      actor_id: authContext.user.id,
      correlation_id: correlationId,
      from_status: null,
      to_status: "needs_edit",
      details: {
        source: "client_request",
        request_id: clientRequest.request_id,
        variant_id: variantId,
        account_id: org_id,
      },
    });

    // Mark request as converted
    await convertClientRequestToVideo(supabaseAdmin, {
      request_id: clientRequest.request_id,
      org_id: clientRequest.org_id,
      video_id: videoId,
      actor_user_id: authContext.user.id,
    });

    // Send email notification to requester (fail-safe)
    let emailResult = null;
    if (clientRequest.requested_by_email) {
      const org = await getClientOrgById(supabaseAdmin, clientRequest.org_id);
      const portalUrl = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/client/videos/${videoId}`
        : undefined;

      emailResult = await sendRequestConvertedEmail({
        recipientEmail: clientRequest.requested_by_email,
        requestId: clientRequest.request_id,
        requestTitle: clientRequest.title,
        videoId,
        orgName: org?.org_name || "Your Organization",
        portalUrl,
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        video_id: videoId,
        request_id: clientRequest.request_id,
        email_sent: emailResult?.sent,
        email_skipped: emailResult?.skipped,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("POST /api/admin/client-requests/convert error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json(
      { ...error.body, correlation_id: correlationId },
      { status: error.status }
    );
  }
}
