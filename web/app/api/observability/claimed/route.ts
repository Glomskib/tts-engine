import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { searchParams } = new URL(request.url);

  // Parse and validate limit
  const limitParam = searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed < 1) {
      const err = apiError("BAD_REQUEST", "limit must be a positive integer", 400, { provided: limitParam });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    limit = Math.min(parsed, MAX_LIMIT);
  }

  try {
    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("videos")
      .select("id,claimed_by,claimed_at,claim_expires_at")
      .not("claimed_by", "is", null)
      .gte("claim_expires_at", now)
      .order("claimed_at", { ascending: false })
      .limit(limit);

    if (error) {
      // If columns don't exist, return gracefully
      if (error.message?.includes("claimed_by") || error.message?.includes("claimed_at") || error.message?.includes("claim_expires_at")) {
        return NextResponse.json({
          ok: true,
          data: [],
          message: "Claim columns not yet migrated",
          correlation_id: correlationId,
        });
      }
      console.error("GET /api/observability/claimed Supabase error:", error);
      const err = apiError("DB_ERROR", error.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    return NextResponse.json({
      ok: true,
      data: data || [],
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/observability/claimed error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
