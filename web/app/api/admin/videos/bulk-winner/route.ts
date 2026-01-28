import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { recordHookOutcome } from "@/lib/hook-feedback-loop";
import { auditLogAsync, AuditEventTypes, EntityTypes } from "@/lib/audit";

export const runtime = "nodejs";

const MAX_BATCH_SIZE = 50;

interface BulkWinnerInput {
  video_ids: string[];
  winner_reason?: string;
  notes?: string;
}

interface VideoResult {
  video_id: string;
  ok: boolean;
  is_winner?: boolean;
  views?: number;
  orders?: number;
  winning_hook?: string | null;
  hook_feedback?: {
    feedback_created: number;
    counts_updated: number;
    skipped_duplicate: number;
  };
  error?: string;
}

/**
 * POST /api/admin/videos/bulk-winner
 *
 * Marks multiple videos as winners in a single request.
 * Idempotent: uses existing hook_feedback uniqueness constraint.
 *
 * Body: { video_ids: string[], winner_reason?: string, notes?: string }
 * Max 50 video_ids per request.
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Admin-only check
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  let body: BulkWinnerInput;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  const { video_ids, winner_reason, notes } = body;

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
      // Fetch video with concept, metrics, and product for hook feedback
      const { data: video, error: videoError } = await supabaseAdmin
        .from("videos")
        .select(`
          id,
          views_total,
          orders_total,
          concept_id,
          product_id,
          script_locked_text,
          concepts:concept_id (
            hook_options,
            angle
          ),
          products:product_id (
            brand_name
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

      // Update video.is_winner flag
      const { error: updateError } = await supabaseAdmin
        .from("videos")
        .update({ is_winner: true })
        .eq("id", video_id);

      if (updateError) {
        results.push({
          video_id,
          ok: false,
          error: `Failed to update video: ${updateError.message}`,
        });
        errorCount++;
        continue;
      }

      // Extract winning elements from video
      const concept = video.concepts as { hook_options?: string[]; angle?: string } | null;
      const winningHook = concept?.hook_options?.[0] || null;
      const winningAngle = concept?.angle || null;
      const winningScript = video.script_locked_text || null;

      // Calculate metrics
      const views = video.views_total || 0;
      const orders = video.orders_total || 0;
      const ctr = views > 0 ? Math.min(orders / views, 1) : 0;
      const cvr = views > 0 ? Math.min(orders / views, 1) : 0;

      // Upsert winner record (idempotent)
      const { error: winnerError } = await supabaseAdmin
        .from("video_winners")
        .upsert({
          video_id,
          views,
          orders,
          ctr,
          cvr,
          winner_reason: winner_reason || "Bulk marked as winner",
          notes: notes || null,
          winning_hook: winningHook,
          winning_angle: winningAngle,
          winning_script: winningScript,
          marked_by: "admin",
        }, {
          onConflict: "video_id",
        });

      if (winnerError) {
        console.error("Failed to create winner record:", winnerError);
        // Non-fatal - continue
      }

      // Hook feedback loop: increment winner_count on proven_hooks (idempotent)
      const product = video.products as { brand_name?: string } | null;
      const brandName = product?.brand_name;
      let hookFeedback = null;

      if (brandName) {
        try {
          hookFeedback = await recordHookOutcome(
            supabaseAdmin,
            video_id,
            brandName,
            video.product_id || null,
            "winner",
            authContext.user?.id || null
          );
        } catch (err) {
          console.error("Failed to record hook feedback:", err);
          // Non-fatal - winner is still marked
        }
      }

      // Log event for audit (non-blocking)
      try {
        await supabaseAdmin.from("video_events").insert({
          video_id,
          event_type: "marked_winner",
          correlation_id: correlationId,
          actor: authContext.user?.id || "admin",
          details: {
            winner_reason: winner_reason || null,
            notes: notes || null,
            bulk_operation: true,
            views,
            orders,
            hook_feedback: hookFeedback ? {
              created: hookFeedback.feedback_created,
              skipped: hookFeedback.skipped_duplicate,
              hooks_updated: hookFeedback.counts_updated,
            } : null,
          },
        });
      } catch (eventErr) {
        console.error("Failed to log video event:", eventErr);
      }

      results.push({
        video_id,
        ok: true,
        is_winner: true,
        views,
        orders,
        winning_hook: winningHook,
        hook_feedback: hookFeedback ? {
          feedback_created: hookFeedback.feedback_created,
          counts_updated: hookFeedback.counts_updated,
          skipped_duplicate: hookFeedback.skipped_duplicate,
        } : undefined,
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
    event_type: AuditEventTypes.HOOK_WINNER,
    entity_type: EntityTypes.VIDEO,
    entity_id: null,
    actor: authContext.user?.id || "admin",
    summary: `Bulk winner: ${successCount} succeeded, ${errorCount} failed`,
    details: {
      total: video_ids.length,
      success_count: successCount,
      error_count: errorCount,
      winner_reason: winner_reason || null,
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
