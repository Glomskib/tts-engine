import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { VIDEO_STATUSES, isQueueStatus } from "@/lib/video-pipeline";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  try {
    // Get counts by status — scoped to current user
    const counts: Record<string, number> = {};
    let totalQueued = 0;

    for (const status of VIDEO_STATUSES) {
      let query = supabaseAdmin
        .from("videos")
        .select("*", { count: "exact", head: true })
        .eq("status", status);

      // Data isolation: scope to current user
      if (!authContext.isAdmin) {
        query = query.eq("client_user_id", authContext.user.id);
      }

      const { count, error } = await query;

      if (error) {
        console.error(`GET /api/observability/queue-summary count error for ${status}:`, error);
        counts[status] = 0;
      } else {
        counts[status] = count || 0;
        if (isQueueStatus(status)) {
          totalQueued += count || 0;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        counts_by_status: counts,
        total_queued: totalQueued,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/observability/queue-summary error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
