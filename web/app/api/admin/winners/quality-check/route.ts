import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

// Quality thresholds (can be made configurable via env vars)
const MIN_VIEWS_THRESHOLD = parseInt(process.env.WINNER_MIN_VIEWS || "100", 10);
const MIN_ORDERS_THRESHOLD = parseInt(process.env.WINNER_MIN_ORDERS || "1", 10);

interface QualityCheckInput {
  video_id: string;
}

interface QualityIssue {
  code: string;
  message: string;
  severity: "warning" | "error";
}

interface QualityCheckResponse {
  ok: true;
  correlation_id: string;
  data: {
    video_id: string;
    passes: boolean;
    issues: QualityIssue[];
    metrics: {
      views: number;
      orders: number;
      has_hook: boolean;
      has_script: boolean;
    };
    thresholds: {
      min_views: number;
      min_orders: number;
    };
  };
}

/**
 * POST /api/admin/winners/quality-check
 *
 * Checks if a video meets quality thresholds before being marked as winner.
 * Returns soft warnings - admin can still override.
 *
 * Checks:
 * - Minimum views threshold
 * - Minimum orders threshold
 * - Hook text non-empty
 * - Script present
 *
 * Body: { video_id: string }
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Admin-only check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  let body: QualityCheckInput;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  const { video_id } = body;

  if (!video_id || typeof video_id !== "string") {
    return createApiErrorResponse("VALIDATION_ERROR", "video_id is required", 400, correlationId);
  }

  try {
    // Fetch video with concept for hook info
    const { data: video, error: videoError } = await supabaseAdmin
      .from("videos")
      .select(`
        id,
        views_total,
        orders_total,
        script_locked_text,
        concept_id,
        concepts:concept_id (
          hook_options
        )
      `)
      .eq("id", video_id.trim())
      .single();

    if (videoError || !video) {
      return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
    }

    const issues: QualityIssue[] = [];

    // Extract metrics
    const views = video.views_total || 0;
    const orders = video.orders_total || 0;
    const concept = video.concepts as { hook_options?: string[] } | null;
    const hookText = concept?.hook_options?.[0] || null;
    const hasHook = !!hookText && hookText.trim().length > 0;
    const hasScript = !!video.script_locked_text;

    // Check minimum views
    if (views < MIN_VIEWS_THRESHOLD) {
      issues.push({
        code: "LOW_VIEWS",
        message: `Video has ${views} views (minimum: ${MIN_VIEWS_THRESHOLD})`,
        severity: "warning",
      });
    }

    // Check minimum orders
    if (orders < MIN_ORDERS_THRESHOLD) {
      issues.push({
        code: "LOW_ORDERS",
        message: `Video has ${orders} orders (minimum: ${MIN_ORDERS_THRESHOLD})`,
        severity: "warning",
      });
    }

    // Check hook text present
    if (!hasHook) {
      issues.push({
        code: "NO_HOOK",
        message: "No hook text found - winner data will be incomplete",
        severity: "warning",
      });
    }

    // Check script present (soft warning)
    if (!hasScript) {
      issues.push({
        code: "NO_SCRIPT",
        message: "No locked script - winning script cannot be recorded",
        severity: "warning",
      });
    }

    // Passes if no errors (warnings are soft blocks)
    const hasErrors = issues.some(i => i.severity === "error");
    const passes = !hasErrors && issues.length === 0;

    const response: QualityCheckResponse = {
      ok: true,
      correlation_id: correlationId,
      data: {
        video_id,
        passes,
        issues,
        metrics: {
          views,
          orders,
          has_hook: hasHook,
          has_script: hasScript,
        },
        thresholds: {
          min_views: MIN_VIEWS_THRESHOLD,
          min_orders: MIN_ORDERS_THRESHOLD,
        },
      },
    };

    const res = NextResponse.json(response);
    res.headers.set("x-correlation-id", correlationId);
    return res;

  } catch (error) {
    console.error(`[${correlationId}] Quality check error:`, error);
    return createApiErrorResponse(
      "DB_ERROR",
      "Failed to perform quality check",
      500,
      correlationId
    );
  }
}
