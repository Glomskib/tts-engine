/**
 * GET/POST /api/videos/[id]/posting
 *
 * GET: Returns current posting metadata + missing fields list + readiness status
 * POST: Upserts posting metadata (target_account, uploader_checklist_completed_at)
 *
 * Posting metadata combines:
 * - Script version fields: caption, hashtags, product_sku, product_link, compliance_notes
 * - Video posting_meta JSONB: target_account, uploader_checklist_completed_at
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId, type ApiErrorCode } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  getCompletePostingMeta,
  updatePostingMeta,
  validatePostingMetaCompleteness,
  validatePostingMetaFields,
  getRequiredPostingFields,
  type PostingMeta,
} from "@/lib/posting-meta";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/videos/[id]/posting
 *
 * Returns:
 * - complete_meta: All posting metadata (from script + posting_meta)
 * - is_ready: Whether all required fields are present
 * - missing: List of missing required fields
 * - present: List of present fields
 * - locked_script_version: Info about locked script (if any)
 * - required_fields: List of all required field names (for documentation)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: videoId } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID
  if (!UUID_REGEX.test(videoId)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid video ID format", 400, correlationId);
  }

  // Check video exists and get status
  const { data: video, error: videoError } = await supabaseAdmin
    .from("videos")
    .select("id, status")
    .eq("id", videoId)
    .single();

  if (videoError || !video) {
    return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
  }

  // Get complete posting metadata
  const result = await getCompletePostingMeta(supabaseAdmin, videoId);

  if (!result.ok) {
    return createApiErrorResponse("DB_ERROR", result.error || "Failed to fetch posting metadata", 500, correlationId);
  }

  // Validate completeness
  const validation = validatePostingMetaCompleteness(result.meta);

  return NextResponse.json({
    ok: true,
    data: {
      video_id: videoId,
      video_status: video.status,
      complete_meta: result.meta,
      is_ready: validation.ok,
      missing: validation.missing,
      present: validation.present,
      has_locked_script: result.locked_script !== null,
      locked_script_version: result.locked_script
        ? {
            version_number: result.locked_script.version_number,
            content_hash: result.locked_script.content_hash,
            locked_at: result.locked_script.locked_at,
          }
        : null,
      posting_meta: result.posting_meta,
      required_fields: getRequiredPostingFields(),
    },
    correlation_id: correlationId,
  });
}

/**
 * POST /api/videos/[id]/posting
 *
 * Request body:
 * - target_account: string (required for readiness)
 * - uploader_checklist_completed_at: string (ISO timestamp, optional)
 *
 * Returns updated posting metadata + readiness status.
 * Idempotent: same payload twice results in no changes on second call.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: videoId } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID
  if (!UUID_REGEX.test(videoId)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid video ID format", 400, correlationId);
  }

  // Get auth context
  const authContext = await getApiAuthContext(request);
  const actor = authContext.user?.id || request.headers.get("x-actor") || "api";

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  // Extract fields
  const updates: Partial<PostingMeta> = {};
  if (body.target_account !== undefined) {
    updates.target_account = body.target_account as string | null;
  }
  if (body.uploader_checklist_completed_at !== undefined) {
    updates.uploader_checklist_completed_at = body.uploader_checklist_completed_at as string | null;
  }

  // Validate fields
  const fieldValidation = validatePostingMetaFields(updates);
  if (!fieldValidation.ok) {
    return createApiErrorResponse("VALIDATION_ERROR", "Invalid field values", 400, correlationId, {
      errors: fieldValidation.errors,
    });
  }

  // Check if any updates provided
  if (Object.keys(updates).length === 0) {
    return createApiErrorResponse("BAD_REQUEST", "No fields to update. Provide target_account or uploader_checklist_completed_at.", 400, correlationId);
  }

  // Update posting meta
  const updateResult = await updatePostingMeta(supabaseAdmin, {
    video_id: videoId,
    updates,
    actor,
    correlation_id: correlationId,
  });

  if (!updateResult.ok) {
    const errorMap: Record<string, { code: ApiErrorCode; status: number }> = {
      "Video not found": { code: "NOT_FOUND", status: 404 },
    };
    const errorInfo = errorMap[updateResult.error || ""] || { code: "DB_ERROR" as ApiErrorCode, status: 500 };
    return createApiErrorResponse(errorInfo.code, updateResult.error || "Failed to update posting metadata", errorInfo.status, correlationId);
  }

  // Get complete posting metadata to check readiness
  const completeResult = await getCompletePostingMeta(supabaseAdmin, videoId);
  const validation = validatePostingMetaCompleteness(completeResult.meta);

  return NextResponse.json({
    ok: true,
    data: {
      video_id: videoId,
      posting_meta: updateResult.posting_meta,
      changed_fields: updateResult.changed_fields,
      complete_meta: completeResult.meta,
      is_ready: validation.ok,
      missing: validation.missing,
      present: validation.present,
    },
    meta: {
      idempotent: updateResult.changed_fields.length === 0,
    },
    correlation_id: correlationId,
  });
}
