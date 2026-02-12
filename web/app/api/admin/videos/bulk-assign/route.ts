import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

const MAX_BATCH_SIZE = 50;

/**
 * POST /api/admin/videos/bulk-assign
 * Assign multiple videos to a user atomically via RPC.
 * Body: { video_ids: string[], assignee_user_id: string }
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

  let body: { video_ids: string[]; assignee_user_id: string };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  const { video_ids, assignee_user_id } = body;

  if (!Array.isArray(video_ids) || video_ids.length === 0) {
    return createApiErrorResponse("VALIDATION_ERROR", "video_ids array is required", 400, correlationId);
  }
  if (video_ids.length > MAX_BATCH_SIZE) {
    return createApiErrorResponse("VALIDATION_ERROR", `Maximum ${MAX_BATCH_SIZE} videos per request`, 400, correlationId);
  }
  if (!assignee_user_id || typeof assignee_user_id !== 'string') {
    return createApiErrorResponse("VALIDATION_ERROR", "assignee_user_id is required", 400, correlationId);
  }

  const { data, error } = await supabaseAdmin.rpc("bulk_assign_videos", {
    p_video_ids: video_ids,
    p_assignee_user_id: assignee_user_id,
    p_assigned_by: authContext.user.id,
    p_correlation_id: correlationId,
  });

  if (error) {
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  const assignedCount = data?.[0]?.assigned_count ?? 0;

  return NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data: { assigned: assignedCount, assignee_user_id },
  });
}
