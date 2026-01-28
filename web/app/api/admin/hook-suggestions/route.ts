import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/admin/hook-suggestions
 * List hook suggestions (admin only)
 *
 * Query params:
 * - status: pending|approved|rejected (default: pending)
 * - limit: max results (default: 50)
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

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

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "pending";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

  // Validate status
  const validStatuses = ["pending", "approved", "rejected"];
  if (!validStatuses.includes(status)) {
    const err = apiError("BAD_REQUEST", `status must be one of: ${validStatuses.join(", ")}`, 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("hook_suggestions")
      .select(`
        id,
        created_at,
        source_video_id,
        product_id,
        brand_name,
        hook_type,
        hook_text,
        hook_hash,
        status,
        reviewed_at,
        reviewed_by,
        review_note
      `)
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Failed to fetch hook suggestions:", error);
      const err = apiError("DB_ERROR", error.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    return NextResponse.json({
      ok: true,
      data: data || [],
      meta: {
        status,
        count: data?.length || 0,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/admin/hook-suggestions error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
