import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/winners/context
 *
 * Get top reference extracts for AI context.
 * Used by AI generation endpoints to include winning examples.
 *
 * Query params:
 * - category: filter by category (optional)
 * - limit: max results (default 5, max 10)
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  const category = searchParams.get("category");
  const limitParam = searchParams.get("limit");
  const limit = Math.min(parseInt(limitParam || "5", 10), 10);

  try {
    // Get top extracts by quality score, optionally filtered by category
    let query = supabaseAdmin
      .from("reference_extracts")
      .select(`
        reference_video_id,
        spoken_hook,
        on_screen_hook,
        visual_hook,
        cta,
        hook_family,
        structure_tags,
        quality_score,
        reference_videos!inner (
          url,
          category,
          status
        )
      `)
      .eq("reference_videos.status", "ready")
      .order("quality_score", { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq("reference_videos.category", category);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`[${correlationId}] Failed to fetch context:`, error);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch context", correlation_id: correlationId },
        { status: 500 }
      );
    }

    // Format for AI consumption
    const context = (data || []).map((extract, idx) => ({
      index: idx + 1,
      hook: extract.spoken_hook,
      hook_family: extract.hook_family,
      cta: extract.cta,
      structure: extract.structure_tags,
      quality: extract.quality_score,
    }));

    return NextResponse.json({
      ok: true,
      data: context,
      count: context.length,
      correlation_id: correlationId,
    });

  } catch (error) {
    console.error(`[${correlationId}] Context fetch error:`, error);
    return NextResponse.json(
      { ok: false, error: "Internal error", correlation_id: correlationId },
      { status: 500 }
    );
  }
}
