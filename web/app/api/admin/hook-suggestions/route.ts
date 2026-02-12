import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
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
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "pending";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

  // Validate status
  const validStatuses = ["pending", "approved", "rejected"];
  if (!validStatuses.includes(status)) {
    return createApiErrorResponse("BAD_REQUEST", `status must be one of: ${validStatuses.join(", ")}`, 400, correlationId);
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
      return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
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
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
