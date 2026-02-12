import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { transitionVideoStatusAtomic } from "@/lib/video-status-machine";
import { isValidStatus, type VideoStatus } from "@/lib/video-pipeline";

export const runtime = "nodejs";

const MAX_BATCH_SIZE = 50;

/**
 * POST /api/admin/videos/bulk-status
 * Change status for multiple videos at once using per-item atomic transitions.
 * Body: { video_ids: string[], status: string }
 * Returns partial results: { success_count, error_count, results[] }
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  let body: { video_ids: string[]; status: string };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  const { video_ids, status } = body;

  if (!Array.isArray(video_ids) || video_ids.length === 0) {
    return createApiErrorResponse("VALIDATION_ERROR", "video_ids array is required", 400, correlationId);
  }
  if (video_ids.length > MAX_BATCH_SIZE) {
    return createApiErrorResponse("VALIDATION_ERROR", `Maximum ${MAX_BATCH_SIZE} videos per request`, 400, correlationId);
  }
  if (!status || !isValidStatus(status)) {
    return createApiErrorResponse("VALIDATION_ERROR", `Invalid status. Must be a valid video status`, 400, correlationId);
  }

  // Process each video individually through the state machine
  const results: Array<{ video_id: string; ok: boolean; action: string; message: string }> = [];
  let success_count = 0;
  let error_count = 0;

  for (const video_id of video_ids) {
    const result = await transitionVideoStatusAtomic(supabaseAdmin, {
      video_id,
      actor: authContext.user!.id,
      target_status: status as VideoStatus,
      correlation_id: correlationId,
      force: true, // Admin bulk operations bypass claim checks
    });

    results.push({
      video_id,
      ok: result.ok,
      action: result.action,
      message: result.message,
    });

    if (result.ok) {
      success_count++;
    } else {
      error_count++;
    }
  }

  return NextResponse.json({
    ok: error_count === 0,
    correlation_id: correlationId,
    data: { success_count, error_count, results },
  });
}
