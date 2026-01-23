import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import {
  RECORDING_STATUSES,
  isValidRecordingStatus,
  validateStatusTransition,
  type RecordingStatus,
  type VideoForValidation,
} from "@/lib/execution-stages";

export const runtime = "nodejs";

async function writeVideoEvent(
  videoId: string,
  eventType: string,
  correlationId: string,
  actor: string,
  fromStatus: string | null,
  toStatus: string | null,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await supabaseAdmin.from("video_events").insert({
      video_id: videoId,
      event_type: eventType,
      correlation_id: correlationId,
      actor,
      from_status: fromStatus,
      to_status: toStatus,
      details,
    });
  } catch (err) {
    console.error("Failed to write video event:", err);
  }
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    const err = apiError("INVALID_UUID", "Invalid video ID format", 400);
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
    recording_status,
    recorded_at,
    edited_at,
    ready_to_post_at,
    posted_at,
    rejected_at,
    recording_notes,
    editor_notes,
    uploader_notes,
    posted_url,
    posted_platform,
    posted_account,
    posted_at_local,
    posting_error,
    updated_by,
    force,
  } = body as Record<string, unknown>;

  // Validate recording_status if provided
  if (recording_status !== undefined && !isValidRecordingStatus(recording_status)) {
    const err = apiError("INVALID_RECORDING_STATUS", `Invalid recording_status. Must be one of: ${RECORDING_STATUSES.join(', ')}`, 400, {
      provided: recording_status,
      allowed: RECORDING_STATUSES,
    });
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Fetch current video
  const { data: currentVideo, error: fetchError } = await supabaseAdmin
    .from("videos")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      const err = apiError("NOT_FOUND", "Video not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    const err = apiError("DB_ERROR", fetchError.message, 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const previousRecordingStatus = currentVideo.recording_status;

  // If transitioning to a new status, validate the transition
  if (recording_status !== undefined && recording_status !== previousRecordingStatus) {
    // Build merged video state for validation (current + pending updates)
    const videoForValidation: VideoForValidation = {
      recording_status: recording_status as string,
      recording_notes: (recording_notes as string | undefined) ?? currentVideo.recording_notes,
      editor_notes: (editor_notes as string | undefined) ?? currentVideo.editor_notes,
      uploader_notes: (uploader_notes as string | undefined) ?? currentVideo.uploader_notes,
      posted_url: (posted_url as string | undefined) ?? currentVideo.posted_url,
      posted_platform: (posted_platform as string | undefined) ?? currentVideo.posted_platform,
      final_video_url: currentVideo.final_video_url,
      google_drive_url: currentVideo.google_drive_url,
      script_locked_text: currentVideo.script_locked_text,
    };

    const validation = validateStatusTransition(
      recording_status as RecordingStatus,
      videoForValidation,
      force === true
    );

    if (!validation.valid && validation.code) {
      const err = apiError(
        validation.code,
        `${validation.error} (use force=true to override)`,
        400,
        validation.details || {}
      );
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
  }

  // Build update payload
  const updatePayload: Record<string, unknown> = {};
  const now = new Date().toISOString();

  if (recording_status !== undefined) {
    updatePayload.recording_status = recording_status;

    // Update last_status_changed_at if status is actually changing
    if (recording_status !== previousRecordingStatus) {
      updatePayload.last_status_changed_at = now;
    }

    // Auto-set timestamps based on status if not provided
    if (recording_status === 'RECORDED' && recorded_at === undefined && !currentVideo.recorded_at) {
      updatePayload.recorded_at = now;
    }
    if (recording_status === 'EDITED' && edited_at === undefined && !currentVideo.edited_at) {
      updatePayload.edited_at = now;
    }
    if (recording_status === 'READY_TO_POST' && ready_to_post_at === undefined && !currentVideo.ready_to_post_at) {
      updatePayload.ready_to_post_at = now;
    }
    if (recording_status === 'POSTED' && posted_at === undefined && !currentVideo.posted_at) {
      updatePayload.posted_at = now;
    }
    if (recording_status === 'REJECTED' && rejected_at === undefined && !currentVideo.rejected_at) {
      updatePayload.rejected_at = now;
    }
  }

  // Handle explicit timestamp overrides
  if (recorded_at !== undefined) updatePayload.recorded_at = recorded_at;
  if (edited_at !== undefined) updatePayload.edited_at = edited_at;
  if (ready_to_post_at !== undefined) updatePayload.ready_to_post_at = ready_to_post_at;
  if (posted_at !== undefined) updatePayload.posted_at = posted_at;
  if (rejected_at !== undefined) updatePayload.rejected_at = rejected_at;

  // Handle notes fields
  if (recording_notes !== undefined) updatePayload.recording_notes = recording_notes;
  if (editor_notes !== undefined) updatePayload.editor_notes = editor_notes;
  if (uploader_notes !== undefined) updatePayload.uploader_notes = uploader_notes;

  // Handle posting fields
  if (posted_url !== undefined) updatePayload.posted_url = posted_url;
  if (posted_platform !== undefined) updatePayload.posted_platform = posted_platform;
  if (posted_account !== undefined) updatePayload.posted_account = posted_account;
  if (posted_at_local !== undefined) updatePayload.posted_at_local = posted_at_local;
  if (posting_error !== undefined) updatePayload.posting_error = posting_error;

  // If no valid fields to update
  if (Object.keys(updatePayload).length === 0) {
    const err = apiError("BAD_REQUEST", "No valid fields provided for update", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Perform update
  const { data: updatedVideo, error: updateError } = await supabaseAdmin
    .from("videos")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    console.error("Failed to update video execution:", updateError);
    const err = apiError("DB_ERROR", updateError.message, 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Log video_event if recording_status changed
  if (recording_status !== undefined && recording_status !== previousRecordingStatus) {
    await writeVideoEvent(
      id,
      "recording_status_changed",
      correlationId,
      typeof updated_by === 'string' ? updated_by : "api",
      previousRecordingStatus,
      recording_status as string,
      {
        recording_notes: recording_notes || null,
        editor_notes: editor_notes || null,
        uploader_notes: uploader_notes || null,
        posted_url: posted_url || null,
        posted_platform: posted_platform || null,
        force: force === true,
      }
    );
  }

  return NextResponse.json({
    ok: true,
    data: updatedVideo,
    meta: {
      previous_recording_status: previousRecordingStatus,
      new_recording_status: updatedVideo.recording_status,
    },
    correlation_id: correlationId,
  });
}
