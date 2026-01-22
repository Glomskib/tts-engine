import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { VIDEO_STATUSES } from "@/lib/video-pipeline";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  try {
    // Get counts by status
    const counts: Record<string, number> = {};
    let totalQueued = 0;

    for (const status of VIDEO_STATUSES) {
      const { count, error } = await supabaseAdmin
        .from("videos")
        .select("*", { count: "exact", head: true })
        .eq("status", status);

      if (error) {
        console.error(`GET /api/observability/queue-summary count error for ${status}:`, error);
        counts[status] = 0;
      } else {
        counts[status] = count || 0;
        if (status === "needs_edit" || status === "ready_to_post") {
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
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
