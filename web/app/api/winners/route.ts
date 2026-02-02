import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/winners
 *
 * List all reference videos (Winners Bank entries) for the authenticated user
 * Query params:
 * - status: filter by status
 * - category: filter by category
 * - limit: max results (default 50)
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - user must be logged in
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

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
      .eq("user_id", authContext.user.id)  // Filter by user_id
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
