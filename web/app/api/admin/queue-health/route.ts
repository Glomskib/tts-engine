import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

interface StuckItem {
  video_id: string;
  video_code: string | null;
  recording_status: string | null;
  last_status_changed_at: string | null;
  hours_in_status: number;
  claimed_by: string | null;
  product_id: string | null;
  brand_name: string | null;
}

interface AgingBuckets {
  under_4h: number;
  h4_to_12h: number;
  h12_to_24h: number;
  over_24h: number;
}

interface QueueHealthResponse {
  ok: true;
  correlation_id: string;
  data: {
    stuck_items: StuckItem[];
    aging_buckets: AgingBuckets;
    total_in_progress: number;
    generated_at: string;
  };
}

/**
 * GET /api/admin/queue-health
 *
 * Returns queue health metrics:
 * - stuck_items: Videos in same status > 24h with no recent events
 * - aging_buckets: Count of videos by time in current status
 *
 * Admin-only endpoint.
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Admin-only check
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  try {
    const now = new Date();
    const h4Ago = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const h12Ago = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const h24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Fetch all in-progress videos (not POSTED, not REJECTED)
    const { data: videos, error: videosError } = await supabaseAdmin
      .from("videos")
      .select(`
        id,
        video_code,
        recording_status,
        last_status_changed_at,
        claimed_by,
        product_id,
        products:product_id (
          brand_name
        )
      `)
      .not("recording_status", "in", "(POSTED,REJECTED)")
      .order("last_status_changed_at", { ascending: true, nullsFirst: true });

    if (videosError) {
      console.error("Failed to fetch videos:", videosError);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch videos", 500, correlationId);
    }

    // Calculate aging buckets and identify stuck items
    const agingBuckets: AgingBuckets = {
      under_4h: 0,
      h4_to_12h: 0,
      h12_to_24h: 0,
      over_24h: 0,
    };

    const stuckItems: StuckItem[] = [];

    for (const video of videos || []) {
      const lastChanged = video.last_status_changed_at
        ? new Date(video.last_status_changed_at)
        : null;

      // If no last_status_changed_at, consider it very old
      const effectiveTime = lastChanged || new Date(0);
      const hoursInStatus = (now.getTime() - effectiveTime.getTime()) / (1000 * 60 * 60);

      // Categorize into aging buckets
      if (effectiveTime > h4Ago) {
        agingBuckets.under_4h++;
      } else if (effectiveTime > h12Ago) {
        agingBuckets.h4_to_12h++;
      } else if (effectiveTime > h24Ago) {
        agingBuckets.h12_to_24h++;
      } else {
        agingBuckets.over_24h++;
      }

      // Stuck = > 24h in same status
      if (hoursInStatus > 24) {
        const product = video.products as { brand_name?: string } | null;
        stuckItems.push({
          video_id: video.id,
          video_code: video.video_code,
          recording_status: video.recording_status,
          last_status_changed_at: video.last_status_changed_at,
          hours_in_status: Math.round(hoursInStatus * 10) / 10,
          claimed_by: video.claimed_by,
          product_id: video.product_id,
          brand_name: product?.brand_name || null,
        });
      }
    }

    // Sort stuck items by hours_in_status descending (oldest first)
    stuckItems.sort((a, b) => b.hours_in_status - a.hours_in_status);

    const response: QueueHealthResponse = {
      ok: true,
      correlation_id: correlationId,
      data: {
        stuck_items: stuckItems,
        aging_buckets: agingBuckets,
        total_in_progress: videos?.length || 0,
        generated_at: now.toISOString(),
      },
    };

    const res = NextResponse.json(response);
    res.headers.set("x-correlation-id", correlationId);
    return res;

  } catch (error) {
    console.error(`[${correlationId}] Queue health error:`, error);
    return createApiErrorResponse(
      "DB_ERROR",
      "Failed to calculate queue health",
      500,
      correlationId
    );
  }
}
