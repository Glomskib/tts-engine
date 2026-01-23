import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVideosColumns } from "@/lib/videosSchema";
import { QUEUE_STATUSES } from "@/lib/video-pipeline";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { computeStageInfo, RECORDING_STATUSES, type VideoForValidation } from "@/lib/execution-stages";

export const runtime = "nodejs";

const VIDEO_SELECT_BASE = "id,variant_id,account_id,status,google_drive_url,created_at,final_video_url,concept_id,product_id";
const VIDEO_SELECT_CLAIM = ",claimed_by,claimed_at,claim_expires_at";
const VIDEO_SELECT_EXECUTION = ",recording_status,last_status_changed_at,posted_url,posted_platform,script_locked_text,script_locked_version,recording_notes,editor_notes,uploader_notes";

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  const statusParam = searchParams.get("status");
  const recordingStatusParam = searchParams.get("recording_status");
  const claimedParam = searchParams.get("claimed") || "unclaimed";
  const accountId = searchParams.get("account_id");
  const limitParam = searchParams.get("limit");

  // Validate pipeline status if provided
  if (statusParam && !QUEUE_STATUSES.includes(statusParam as typeof QUEUE_STATUSES[number])) {
    const err = apiError("BAD_REQUEST", `status must be one of: ${QUEUE_STATUSES.join(", ")}`, 400, { provided: statusParam });
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate recording_status if provided
  if (recordingStatusParam && !RECORDING_STATUSES.includes(recordingStatusParam as typeof RECORDING_STATUSES[number])) {
    const err = apiError("BAD_REQUEST", `recording_status must be one of: ${RECORDING_STATUSES.join(", ")}`, 400, { provided: recordingStatusParam });
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate claimed param
  const validClaimedValues = ["unclaimed", "claimed", "any"];
  if (!validClaimedValues.includes(claimedParam)) {
    const err = apiError("BAD_REQUEST", `claimed must be one of: ${validClaimedValues.join(", ")}`, 400, { provided: claimedParam });
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Parse and validate limit
  let limit = 50;
  if (limitParam) {
    const parsedLimit = parseInt(limitParam, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      const err = apiError("BAD_REQUEST", "limit must be a positive integer", 400, { provided: limitParam });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    limit = Math.min(parsedLimit, 200);
  }

  try {
    // Check if claim columns exist (migration 010)
    const existingColumns = await getVideosColumns();
    const hasClaimColumns = existingColumns.has("claimed_by") && existingColumns.has("claim_expires_at");
    const hasExecutionColumns = existingColumns.has("recording_status") && existingColumns.has("last_status_changed_at");

    let selectCols = VIDEO_SELECT_BASE;
    if (hasClaimColumns) selectCols += VIDEO_SELECT_CLAIM;
    if (hasExecutionColumns) selectCols += VIDEO_SELECT_EXECUTION;

    // Order by last_status_changed_at if filtering by recording_status, otherwise by created_at
    const orderColumn = recordingStatusParam && hasExecutionColumns ? "last_status_changed_at" : "created_at";

    let query = supabaseAdmin
      .from("videos")
      .select(selectCols)
      .order(orderColumn, { ascending: false })
      .limit(limit);

    // Filter by pipeline status
    if (statusParam) {
      query = query.eq("status", statusParam);
    } else if (!recordingStatusParam) {
      // Only apply default queue status filter if not filtering by recording_status
      query = query.in("status", [...QUEUE_STATUSES]);
    }

    // Filter by recording_status if provided and columns exist
    if (recordingStatusParam && hasExecutionColumns) {
      query = query.eq("recording_status", recordingStatusParam);
    }

    // Filter by account_id if provided
    if (accountId) {
      query = query.eq("account_id", accountId);
    }

    // Apply claimed filter only if columns exist
    if (hasClaimColumns) {
      const now = new Date().toISOString();
      if (claimedParam === "unclaimed") {
        // unclaimed: claimed_by is null OR claim_expires_at < now
        query = query.or(`claimed_by.is.null,claim_expires_at.lt.${now}`);
      } else if (claimedParam === "claimed") {
        // claimed: claimed_by not null AND claim_expires_at >= now
        query = query.not("claimed_by", "is", null).gte("claim_expires_at", now);
      }
      // "any" - no additional filter
    }

    const { data, error } = await query;

    if (error) {
      console.error("GET /api/videos/queue Supabase error:", error);
      const err = apiError("DB_ERROR", error.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Compute stage info for each video
    const videos = (data as unknown) as Record<string, unknown>[] | null;
    const videosWithStageInfo = (videos || []).map((video) => {
      const videoForValidation: VideoForValidation = {
        recording_status: video.recording_status as string | null,
        recording_notes: video.recording_notes as string | null,
        editor_notes: video.editor_notes as string | null,
        uploader_notes: video.uploader_notes as string | null,
        posted_url: video.posted_url as string | null,
        posted_platform: video.posted_platform as string | null,
        final_video_url: video.final_video_url as string | null,
        google_drive_url: video.google_drive_url as string | null,
        script_locked_text: video.script_locked_text as string | null,
      };

      const stageInfo = computeStageInfo(videoForValidation);

      return {
        ...video,
        // Stage info computed fields
        can_move_next: stageInfo.can_move_next,
        blocked_reason: stageInfo.blocked_reason,
        next_action: stageInfo.next_action,
        next_status: stageInfo.next_status,
        // Individual action flags
        can_record: stageInfo.can_record,
        can_mark_edited: stageInfo.can_mark_edited,
        can_mark_ready_to_post: stageInfo.can_mark_ready_to_post,
        can_mark_posted: stageInfo.can_mark_posted,
        // Required fields for next step
        required_fields: stageInfo.required_fields,
      };
    });

    return NextResponse.json({
      ok: true,
      data: videosWithStageInfo,
      correlation_id: correlationId
    });

  } catch (err) {
    console.error("GET /api/videos/queue error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
