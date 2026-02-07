import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  generateCorrelationId,
  createApiErrorResponse,
} from "@/lib/api-errors";
import {
  enforceRateLimits,
  extractRateLimitContext,
} from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const correlationId = generateCorrelationId();
  const { id: videoId } = await context.params;

  // Auth
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Rate limit
  const rlContext = {
    ...extractRateLimitContext(request),
    userId: authContext.user.id,
  };
  const rateLimited = enforceRateLimits(rlContext, correlationId, { userLimit: 10 });
  if (rateLimited) return rateLimited;

  // Validate video ID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(videoId)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid video ID format", 400, correlationId);
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  // Validate and sanitize metrics
  const performanceData: Record<string, unknown> = {};
  const numericFields = ["views", "likes", "shares", "comments", "engagement_rate"] as const;

  for (const field of numericFields) {
    if (body[field] !== undefined) {
      const val = Number(body[field]);
      if (isNaN(val) || val < 0) {
        return createApiErrorResponse(
          "VALIDATION_ERROR",
          `${field} must be a non-negative number`,
          400,
          correlationId
        );
      }
      performanceData[field] = val;
    }
  }

  if (Object.keys(performanceData).length === 0) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "At least one metric is required: views, likes, shares, comments, engagement_rate",
      400,
      correlationId
    );
  }

  performanceData.recorded_at = new Date().toISOString();

  // Verify video exists
  const { data: video, error: videoError } = await supabaseAdmin
    .from("videos")
    .select("id")
    .eq("id", videoId)
    .single();

  if (videoError || !video) {
    return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
  }

  // Update performance_data (merge with existing)
  const { data: existing } = await supabaseAdmin
    .from("videos")
    .select("performance_data")
    .eq("id", videoId)
    .single();

  const merged = {
    ...(existing?.performance_data as Record<string, unknown> ?? {}),
    ...performanceData,
  };

  const { error: updateError } = await supabaseAdmin
    .from("videos")
    .update({ performance_data: merged })
    .eq("id", videoId);

  if (updateError) {
    console.error(`[${correlationId}] Failed to update video performance:`, updateError.message);
    return createApiErrorResponse("DB_ERROR", "Failed to update performance data", 500, correlationId);
  }

  const response = NextResponse.json(
    {
      ok: true,
      video_id: videoId,
      performance_data: merged,
      correlation_id: correlationId,
    },
    { status: 200 }
  );

  response.headers.set("x-correlation-id", correlationId);
  return response;
}
