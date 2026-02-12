import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { recordHookOutcome } from "@/lib/hook-feedback-loop";
import { auditLogAsync, AuditEventTypes, EntityTypes } from "@/lib/audit";

export const runtime = "nodejs";

interface MarkUnderperformParams {
  reason_code?: string;
  notes?: string;
}

/**
 * POST /api/admin/videos/[video_id]/underperform
 *
 * Marks a video as underperforming.
 * Increments underperform_count on matching proven_hooks (idempotent).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ video_id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { video_id } = await params;

  if (!video_id) {
    return NextResponse.json(
      { ok: false, error: "video_id is required", correlation_id: correlationId },
      { status: 400 }
    );
  }

  // Admin-only check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  let body: MarkUnderperformParams = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine
  }

  const { reason_code, notes } = body;

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
      .eq("id", video_id)
      .single();

    if (videoError || !video) {
      return NextResponse.json(
        { ok: false, error: "Video not found", correlation_id: correlationId },
        { status: 404 }
      );
    }

    // Get brand_name from product
    const product = video.products as { brand?: string } | null;
    const brandName = product?.brand;

    if (!brandName) {
      return NextResponse.json({
        ok: true,
        data: {
          video_id,
          message: "No brand_name found for video - no hooks to update",
          hook_feedback: null,
        },
        correlation_id: correlationId,
      });
    }

    // Audit log for underperform marking
    auditLogAsync({
      correlation_id: correlationId,
      event_type: AuditEventTypes.HOOK_UNDERPERFORM,
      entity_type: EntityTypes.VIDEO,
      entity_id: video_id,
      actor: authContext.user?.id || "admin",
      summary: `Video ${video_id} marked as underperforming`,
      details: {
        reason_code: reason_code || null,
        notes: notes || null,
        brand_name: brandName,
      },
    });

    // Record hook feedback (idempotent)
    const hookFeedback = await recordHookOutcome(
      supabaseAdmin,
      video_id,
      brandName,
      video.product_id || null,
      "underperform",
      authContext.user?.id || null
    );

    // Log event for audit
    try {
      await supabaseAdmin.from("video_events").insert({
        video_id,
        event_type: "marked_underperform",
        correlation_id: correlationId,
        actor: authContext.user?.id || "admin",
        details: {
          reason_code: reason_code || null,
          notes: notes || null,
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

    return NextResponse.json({
      ok: true,
      data: {
        video_id,
        outcome: "underperform",
        hook_feedback: hookFeedback,
      },
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Failed to mark underperform:`, error);
    return NextResponse.json(
      { ok: false, error: "Failed to mark underperform", correlation_id: correlationId },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/videos/[video_id]/underperform
 *
 * Get underperform feedback history for a video's hooks.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ video_id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { video_id } = await params;

  if (!video_id) {
    return NextResponse.json(
      { ok: false, error: "video_id is required", correlation_id: correlationId },
      { status: 400 }
    );
  }

  // Admin-only check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  try {
    // Get all hook_feedback entries for this video with outcome='underperform'
    const { data: feedback } = await supabaseAdmin
      .from("hook_feedback")
      .select(`
        id,
        created_at,
        hook_id,
        outcome,
        reason_code,
        notes,
        hook:proven_hooks (
          id,
          hook_type,
          hook_text,
          underperform_count
        )
      `)
      .eq("source_video_id", video_id)
      .eq("outcome", "underperform");

    return NextResponse.json({
      ok: true,
      data: {
        video_id,
        feedback: feedback || [],
      },
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Failed to get underperform history:`, error);
    return NextResponse.json(
      { ok: false, error: "Failed to get underperform history", correlation_id: correlationId },
      { status: 500 }
    );
  }
}
