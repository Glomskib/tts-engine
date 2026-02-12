import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Validate UUID format
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid video ID format", 400, correlationId);
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  // Validate and build update payload
  const updatePayload: Record<string, unknown> = {
    stats_updated_at: body.scraped_at || new Date().toISOString(),
  };

  const numericFields = [
    ["views", "tiktok_views"],
    ["likes", "tiktok_likes"],
    ["comments", "tiktok_comments"],
    ["shares", "tiktok_shares"],
    ["saves", "tiktok_saves"],
    ["sales_count", "tiktok_sales"],
    ["revenue", "tiktok_revenue"],
    ["clicks", "tiktok_clicks"],
  ] as const;

  let hasMetrics = false;
  for (const [inputKey, dbColumn] of numericFields) {
    if (body[inputKey] !== undefined) {
      const val = Number(body[inputKey]);
      if (isNaN(val) || val < 0) {
        return createApiErrorResponse(
          "BAD_REQUEST",
          `${inputKey} must be a non-negative number`,
          400
        , correlationId);
      }
      updatePayload[dbColumn] = val;
      hasMetrics = true;
    }
  }

  if (!hasMetrics) {
    return createApiErrorResponse("BAD_REQUEST", "At least one metric is required (views, likes, comments, shares, saves, sales_count, revenue, clicks)", 400, correlationId);
  }

  // If tiktok_url provided, set it
  if (typeof body.tiktok_url === "string" && body.tiktok_url.trim()) {
    updatePayload.tiktok_url = body.tiktok_url.trim();
    // Also sync to posted_url/posted_platform if not already set
    updatePayload.posted_url = body.tiktok_url.trim();
    updatePayload.posted_platform = "tiktok";
  }

  // Also sync to aggregate columns for backwards compatibility
  if (updatePayload.tiktok_views !== undefined)
    updatePayload.views_total = updatePayload.tiktok_views;
  if (updatePayload.tiktok_likes !== undefined)
    updatePayload.likes_total = updatePayload.tiktok_likes;
  if (updatePayload.tiktok_comments !== undefined)
    updatePayload.comments_total = updatePayload.tiktok_comments;
  if (updatePayload.tiktok_shares !== undefined)
    updatePayload.shares_total = updatePayload.tiktok_shares;
  if (updatePayload.tiktok_revenue !== undefined)
    updatePayload.revenue_total = updatePayload.tiktok_revenue;
  if (updatePayload.tiktok_sales !== undefined)
    updatePayload.orders_total = updatePayload.tiktok_sales;
  updatePayload.last_metric_at = updatePayload.stats_updated_at;

  // Update video
  const { data, error } = await supabaseAdmin
    .from("videos")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
    }
    console.error(`[${correlationId}] POST /api/videos/[id]/stats error:`, error);
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}
