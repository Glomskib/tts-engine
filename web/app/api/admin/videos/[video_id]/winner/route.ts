import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { recordHookOutcome } from "@/lib/hook-feedback-loop";

export const runtime = "nodejs";

interface MarkWinnerParams {
  is_winner: boolean;
  winner_reason?: string;
  notes?: string;
}

/**
 * POST /api/admin/videos/[video_id]/winner
 *
 * Marks a video as a winner (or removes winner status).
 * Captures current performance metrics and winning elements.
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
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  let body: MarkWinnerParams;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON", correlation_id: correlationId },
      { status: 400 }
    );
  }

  const { is_winner, winner_reason, notes } = body;

  if (typeof is_winner !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "is_winner (boolean) is required", correlation_id: correlationId },
      { status: 400 }
    );
  }

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
      .eq("id", video_id)
      .single();

    if (videoError || !video) {
      return NextResponse.json(
        { ok: false, error: "Video not found", correlation_id: correlationId },
        { status: 404 }
      );
    }

    // Update video.is_winner flag
    const { error: updateError } = await supabaseAdmin
      .from("videos")
      .update({ is_winner })
      .eq("id", video_id);

    if (updateError) {
      throw updateError;
    }

    if (is_winner) {
      // Extract winning elements from video
      const concept = video.concepts as { hook_options?: string[]; angle?: string } | null;
      const winningHook = concept?.hook_options?.[0] || null;
      const winningAngle = concept?.angle || null;
      const winningScript = video.script_locked_text || null;

      // Calculate CTR/CVR if we have data (simplified)
      const views = video.views_total || 0;
      const orders = video.orders_total || 0;
      const ctr = views > 0 ? Math.min(orders / views, 1) : 0; // Simplified - real CTR needs clicks
      const cvr = views > 0 ? Math.min(orders / views, 1) : 0;

      // Upsert winner record
      const { error: winnerError } = await supabaseAdmin
        .from("video_winners")
        .upsert({
          video_id,
          views,
          orders,
          ctr,
          cvr,
          winner_reason: winner_reason || "Manually marked as winner",
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
        // Non-fatal - video is still marked
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

      return NextResponse.json({
        ok: true,
        data: {
          video_id,
          is_winner: true,
          views,
          orders,
          winning_hook: winningHook,
          hook_feedback: hookFeedback,
        },
        correlation_id: correlationId,
      });
    } else {
      // Remove winner record
      await supabaseAdmin
        .from("video_winners")
        .delete()
        .eq("video_id", video_id);

      return NextResponse.json({
        ok: true,
        data: {
          video_id,
          is_winner: false,
        },
        correlation_id: correlationId,
      });
    }
  } catch (error) {
    console.error(`[${correlationId}] Failed to update winner status:`, error);
    return NextResponse.json(
      { ok: false, error: "Failed to update winner status", correlation_id: correlationId },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/videos/[video_id]/winner
 *
 * Get winner status and details for a video.
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

  try {
    const { data: winner } = await supabaseAdmin
      .from("video_winners")
      .select("*")
      .eq("video_id", video_id)
      .single();

    const { data: video } = await supabaseAdmin
      .from("videos")
      .select("is_winner")
      .eq("id", video_id)
      .single();

    return NextResponse.json({
      ok: true,
      data: {
        video_id,
        is_winner: video?.is_winner || false,
        winner_details: winner || null,
      },
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Failed to get winner status:`, error);
    return NextResponse.json(
      { ok: false, error: "Failed to get winner status", correlation_id: correlationId },
      { status: 500 }
    );
  }
}
