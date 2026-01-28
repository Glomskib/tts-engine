import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/winners
 *
 * List all reference videos (Winners Bank entries)
 * Query params:
 * - status: filter by status
 * - category: filter by category
 * - limit: max results (default 50)
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const limitParam = searchParams.get("limit");
  const limit = Math.min(parseInt(limitParam || "50", 10), 200);

  try {
    let query = supabaseAdmin
      .from("reference_videos")
      .select(`
        *,
        reference_extracts (
          spoken_hook,
          hook_family,
          quality_score
        )
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }
    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`[${correlationId}] Failed to fetch winners:`, error);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch winners", correlation_id: correlationId },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: data || [],
      correlation_id: correlationId,
    });

  } catch (error) {
    console.error(`[${correlationId}] Winners list error:`, error);
    return NextResponse.json(
      { ok: false, error: "Internal error", correlation_id: correlationId },
      { status: 500 }
    );
  }
}
