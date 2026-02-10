import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

const MAX_BATCH_SIZE = 50;

/**
 * POST /api/admin/videos/bulk-assign
 * Assign multiple videos to a user.
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

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("videos")
    .update({
      assigned_to: assignee_user_id,
      assigned_at: now,
      assigned_by: authContext.user.id,
    })
    .in("id", video_ids)
    .select("id");

  if (error) {
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  // Log bulk event
  try {
    await supabaseAdmin.from("video_events").insert(
      video_ids.map(vid => ({
        video_id: vid,
        event_type: "assigned",
        correlation_id: correlationId,
        actor: authContext.user!.id,
        details: { assignee_user_id, bulk_operation: true },
      }))
    );
  } catch { /* non-fatal */ }

  return NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data: { assigned: data?.length || 0, assignee_user_id },
  });
}
