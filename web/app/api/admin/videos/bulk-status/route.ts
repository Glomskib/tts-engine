import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

const MAX_BATCH_SIZE = 50;

const VALID_STATUSES = [
  'DRAFT', 'SCRIPTED', 'READY_TO_FILM', 'RECORDING', 'FILMED',
  'EDITING', 'EDITED', 'REVIEW', 'APPROVED', 'READY_TO_POST',
  'POSTED', 'ARCHIVED', 'REJECTED',
];

/**
 * POST /api/admin/videos/bulk-status
 * Change status for multiple videos at once.
 * Body: { video_ids: string[], status: string }
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
  if (!status || !VALID_STATUSES.includes(status)) {
    return createApiErrorResponse("VALIDATION_ERROR", `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, 400, correlationId);
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("videos")
    .update({ status, last_status_changed_at: now })
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
        event_type: "status_changed",
        correlation_id: correlationId,
        actor: authContext.user!.id,
        details: { new_status: status, bulk_operation: true },
      }))
    );
  } catch { /* non-fatal */ }

  return NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data: { updated: data?.length || 0, status },
  });
}
