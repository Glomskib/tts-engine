import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { recordHookOutcome } from "@/lib/hook-feedback-loop";
import { auditLogAsync, AuditEventTypes, EntityTypes } from "@/lib/audit";

export const runtime = "nodejs";

const MAX_BATCH_SIZE = 50;

interface BulkUnderperformInput {
  video_ids: string[];
  reason_code?: string;
  notes?: string;
}

interface VideoResult {
  video_id: string;
  ok: boolean;
  outcome?: string;
  hook_feedback?: {
    feedback_created: number;
    counts_updated: number;
    skipped_duplicate: number;
  };
  error?: string;
}

/**
 * POST /api/admin/videos/bulk-underperform
 *
 * Marks multiple videos as underperforming in a single request.
 * Idempotent: uses existing hook_feedback uniqueness constraint.
 *
 * Body: { video_ids: string[], reason_code?: string, notes?: string }
 * Max 50 video_ids per request.
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Admin-only check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  let body: BulkUnderperformInput;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  const { video_ids, reason_code, notes } = body;

  // Validate video_ids
  if (!Array.isArray(video_ids) || video_ids.length === 0) {
    return createApiErrorResponse("VALIDATION_ERROR", "video_ids array is required and must not be empty", 400, correlationId);
  }

  if (video_ids.length > MAX_BATCH_SIZE) {
    return createApiErrorResponse("VALIDATION_ERROR", `Maximum ${MAX_BATCH_SIZE} video_ids per request`, 400, correlationId, {
      provided: video_ids.length,
      max: MAX_BATCH_SIZE,
    });
  }

  // Validate all are strings
  const invalidIds = video_ids.filter(id => typeof id !== "string" || !id.trim());
  if (invalidIds.length > 0) {
    return createApiErrorResponse("VALIDATION_ERROR", "All video_ids must be non-empty strings", 400, correlationId);
  }

  const results: VideoResult[] = [];
  let successCount = 0;
  let errorCount = 0;

  // Process each video
  for (const video_id of video_ids) {
    try {
      // Fetch video with product for brand_name
      const { data: video, error: videoError } = await supabaseAdmin
        .from("videos")
        .select(`
          id,
          product_id,
          recording_status,
          products:product_id (
            brand
          )
        `)
        .eq("id", video_id.trim())
        .single();

      if (videoError || !video) {
        results.push({
          video_id,
          ok: false,
          error: "Video not found",
        });
        errorCount++;
        continue;
      }

      // Get brand_name from product
      const product = video.products as { brand?: string } | null;
      const brandName = product?.brand;

      if (!brandName) {
        results.push({
          video_id,
          ok: true,
          outcome: "skipped",
          error: "No brand_name found - no hooks to update",
        });
        continue;
      }

      // Record hook feedback (idempotent)
      const hookFeedback = await recordHookOutcome(
        supabaseAdmin,
        video_id,
        brandName,
        video.product_id || null,
        "underperform",
        authContext.user?.id || null
      );

      // Log event for audit (non-blocking)
      try {
        await supabaseAdmin.from("video_events").insert({
          video_id,
          event_type: "marked_underperform",
          correlation_id: correlationId,
          actor: authContext.user?.id || "admin",
          details: {
            reason_code: reason_code || null,
            notes: notes || null,
            bulk_operation: true,
            hook_feedback: {
              created: hookFeedback.feedback_created,
              skipped: hookFeedback.skipped_duplicate,
              hooks_updated: hookFeedback.counts_updated,
            },
          },
        });
      } catch (eventErr) {
        console.error("Failed to log video event:", eventErr);
      }

      results.push({
        video_id,
        ok: true,
        outcome: "underperform",
        hook_feedback: {
          feedback_created: hookFeedback.feedback_created,
          counts_updated: hookFeedback.counts_updated,
          skipped_duplicate: hookFeedback.skipped_duplicate,
        },
      });
      successCount++;

    } catch (error) {
      console.error(`[${correlationId}] Failed to process video ${video_id}:`, error);
      results.push({
        video_id,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      errorCount++;
    }
  }

  // Audit log for bulk operation
  auditLogAsync({
    correlation_id: correlationId,
    event_type: AuditEventTypes.HOOK_UNDERPERFORM,
    entity_type: EntityTypes.VIDEO,
    entity_id: null,
    actor: authContext.user?.id || "admin",
    summary: `Bulk underperform: ${successCount} succeeded, ${errorCount} failed`,
    details: {
      total: video_ids.length,
      success_count: successCount,
      error_count: errorCount,
      reason_code: reason_code || null,
      notes: notes || null,
      video_ids,
    },
  });

  const response = NextResponse.json({
    ok: errorCount === 0,
    correlation_id: correlationId,
    data: {
      total: video_ids.length,
      success_count: successCount,
      error_count: errorCount,
      results,
    },
  });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}
