import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  generateCorrelationId,
  createApiErrorResponse,
} from "@/lib/api-errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/clawbot/summaries/latest
 * Fetch the latest weekly summary for the authenticated user
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth — admin only
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  const { data: row, error } = await supabaseAdmin
    .from("clawbot_summaries")
    .select("id, summary, period_start, period_end, created_at")
    .eq("user_id", authContext.user.id)
    .eq("summary_type", "weekly")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`[${correlationId}] Failed to fetch latest summary:`, error.message);
    return createApiErrorResponse("DB_ERROR", "Failed to fetch summary", 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    summary: row?.summary ?? null,
    period: row ? { start: row.period_start, end: row.period_end } : null,
    created_at: row?.created_at ?? null,
    correlation_id: correlationId,
  });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}
