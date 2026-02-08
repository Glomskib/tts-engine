import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isValidStatus, VideoStatus } from "@/lib/video-pipeline";
import { transitionVideoStatusAtomic } from "@/lib/video-status-machine";
import { apiError, generateCorrelationId, type ApiErrorCode } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { auditLogAsync, AuditEventTypes, EntityTypes } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { id } = await params;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    const err = apiError("INVALID_UUID", "Video ID must be a valid UUID", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const { data, error } = await supabaseAdmin
    .from("videos")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      const err = apiError("NOT_FOUND", "Video not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    const err = apiError("DB_ERROR", error.message, 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { id } = await params;

  if (!id || typeof id !== "string") {
    const err = apiError("BAD_REQUEST", "Video ID is required", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    const err = apiError("INVALID_UUID", "Video ID must be a valid UUID", 400, { provided: id });
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const {
    status,
    google_drive_url,
    final_video_url,
    raw_footage_url,
    assets_url,
    script_locked_text,
    product_id,
    posting_account_id,
    reason_code,
    reason_message,
    // Selected hook package fields
    selected_spoken_hook,
    selected_visual_hook,
    selected_on_screen_hook,
    selected_emotional_driver,
    selected_cta_overlay,
    selected_cta_family,
  } = body as Record<string, unknown>;

  // Validate status if provided
  if (status !== undefined) {
    if (typeof status !== "string" || !isValidStatus(status)) {
      const err = apiError("INVALID_STATUS", "Invalid status value", 400, { provided: status });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
  }

  // Get authentication context
  const authContext = await getApiAuthContext(request);
  const actor = authContext.user?.id || "api";
  const isAdmin = authContext.isAdmin;

  // If status is changing, use the centralized transition function
  if (status !== undefined) {
    // Build additional updates for non-status fields
    const additionalUpdates: Record<string, unknown> = {};

    if (google_drive_url !== undefined) {
      additionalUpdates.google_drive_url = google_drive_url;
    } else if (final_video_url !== undefined) {
      additionalUpdates.google_drive_url = final_video_url;
    }

    const result = await transitionVideoStatusAtomic(supabaseAdmin, {
      video_id: id,
      actor,
      target_status: status as VideoStatus,
      reason_code: typeof reason_code === "string" ? reason_code : undefined,
      reason_message: typeof reason_message === "string" ? reason_message : undefined,
      correlation_id: correlationId,
      force: isAdmin,
      additional_updates: Object.keys(additionalUpdates).length > 0 ? additionalUpdates : undefined,
    });

    if (!result.ok) {
      // Map result to appropriate HTTP error
      const errorMap: Record<string, { code: ApiErrorCode; status: number }> = {
        NOT_FOUND: { code: "NOT_FOUND", status: 404 },
        INVALID_STATUS: { code: "INVALID_STATUS", status: 400 },
        INVALID_TRANSITION: { code: "INVALID_TRANSITION", status: 400 },
        CLAIM_REQUIRED: { code: "CLAIM_REQUIRED", status: 409 },
        REASON_REQUIRED: { code: "REASON_REQUIRED", status: 400 },
        CONFLICT: { code: "CONFLICT", status: 409 },
        DB_ERROR: { code: "DB_ERROR", status: 500 },
      };

      const errorInfo = errorMap[result.error_code || "DB_ERROR"] || { code: "DB_ERROR" as ApiErrorCode, status: 500 };
      const err = apiError(errorInfo.code, result.message, errorInfo.status, {
        current_status: result.current_status,
        previous_status: result.previous_status,
        allowed_next: result.allowed_next,
      });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Fetch full updated video for response
    const { data: video } = await supabaseAdmin
      .from("videos")
      .select("*")
      .eq("id", id)
      .single();

    return NextResponse.json({
      ok: true,
      data: video,
      meta: {
        action: result.action,
        previous_status: result.previous_status,
        current_status: result.current_status,
      },
      correlation_id: correlationId,
    });
  }

  // Non-status updates
  const updatePayload: Record<string, unknown> = {};

  if (google_drive_url !== undefined) {
    updatePayload.google_drive_url = google_drive_url;
  }
  if (final_video_url !== undefined) {
    updatePayload.final_video_url = final_video_url;
  }
  if (raw_footage_url !== undefined) {
    updatePayload.raw_footage_url = raw_footage_url;
  }
  if (assets_url !== undefined) {
    updatePayload.assets_url = assets_url;
  }
  if (script_locked_text !== undefined) {
    updatePayload.script_locked_text = script_locked_text;
    // Also update version if script is being set
    if (typeof script_locked_text === "string" && script_locked_text.trim()) {
      updatePayload.script_locked_version = 1;
    }
  }
  if (product_id !== undefined) {
    updatePayload.product_id = product_id;
  }
  if (posting_account_id !== undefined) {
    updatePayload.posting_account_id = posting_account_id;
  }

  // Selected hook package fields
  if (selected_spoken_hook !== undefined) {
    updatePayload.selected_spoken_hook = selected_spoken_hook;
  }
  if (selected_visual_hook !== undefined) {
    updatePayload.selected_visual_hook = selected_visual_hook;
  }
  if (selected_on_screen_hook !== undefined) {
    updatePayload.selected_on_screen_hook = selected_on_screen_hook;
  }
  if (selected_emotional_driver !== undefined) {
    updatePayload.selected_emotional_driver = selected_emotional_driver;
  }
  if (selected_cta_overlay !== undefined) {
    updatePayload.selected_cta_overlay = selected_cta_overlay;
  }
  if (selected_cta_family !== undefined) {
    updatePayload.selected_cta_family = selected_cta_family;
  }

  if (Object.keys(updatePayload).length === 0) {
    const err = apiError("BAD_REQUEST", "No valid fields provided for update", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("videos")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        const err = apiError("NOT_FOUND", "Video not found", 404, { video_id: id });
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
      }
      const err = apiError("DB_ERROR", error.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    return NextResponse.json({ ok: true, data, correlation_id: correlationId });

  } catch (err) {
    console.error("PATCH /api/videos/[id] error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { id } = await params;

  // Auth check - admin only
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }
  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    const err = apiError("INVALID_UUID", "Video ID must be a valid UUID", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    // Verify video exists
    const { data: video, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select("id, video_code, recording_status")
      .eq("id", id)
      .single();

    if (fetchError || !video) {
      const err = apiError("NOT_FOUND", "Video not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Delete related records first (video_events, scheduled_posts referencing this video)
    await supabaseAdmin.from("video_events").delete().eq("video_id", id);
    await supabaseAdmin.from("scheduled_posts").delete().eq("metadata->>video_id", id);

    // Delete the video
    const { error: deleteError } = await supabaseAdmin
      .from("videos")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("DELETE /api/videos/[id] error:", deleteError);
      const err = apiError("DB_ERROR", deleteError.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    auditLogAsync({
      correlation_id: correlationId,
      event_type: AuditEventTypes.VIDEO_DELETED,
      entity_type: EntityTypes.VIDEO,
      entity_id: id,
      actor: authContext.user.id,
      summary: `Video ${video.video_code || id} deleted`,
      details: { recording_status: video.recording_status },
    });

    return NextResponse.json({ ok: true, deleted: id, correlation_id: correlationId });
  } catch (err) {
    console.error("DELETE /api/videos/[id] error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
