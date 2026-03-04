/**
 * GET /api/admin/finops/reconcile-heygen
 *
 * Lightweight reconciliation: cross-references completed HeyGen videos
 * with tool_usage_events to find any that are missing cost events.
 *
 * Query params:
 *   ?days=7   — look back N days (default 30)
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { estimateHeyGenCost } from "@/lib/finops/heygen-cost";
import { withErrorCapture } from "@/lib/errors/withErrorCapture";

export const runtime = "nodejs";

export const GET = withErrorCapture(async (request: Request) => {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.isAdmin) {
    return createApiErrorResponse(
      "FORBIDDEN",
      "Admin access required",
      403,
      correlationId
    );
  }

  const url = new URL(request.url);
  const days = Math.min(Number(url.searchParams.get("days")) || 30, 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  // 1. All completed HeyGen videos in the window
  const { data: videos, error: vErr } = await supabaseAdmin
    .from("videos")
    .select("id, render_task_id, created_at, recording_status")
    .eq("render_provider", "heygen")
    .gte("created_at", since)
    .in("recording_status", [
      "READY_FOR_REVIEW",
      "APPROVED",
      "POSTED",
      "WINNER",
      "PUBLISHED",
    ]);

  if (vErr) {
    return NextResponse.json(
      { ok: false, error: vErr.message },
      { status: 500 }
    );
  }

  if (!videos?.length) {
    return NextResponse.json({
      ok: true,
      total_videos: 0,
      with_cost_event: 0,
      missing_cost_event: 0,
      missing: [],
      total_tracked_usd: 0,
      days_lookback: days,
    });
  }

  // 2. All HeyGen tool_usage_events in the window
  const renderTaskIds = videos
    .map((v) => v.render_task_id)
    .filter(Boolean) as string[];

  const { data: events } = await supabaseAdmin
    .from("tool_usage_events")
    .select("run_id, cost_usd, metadata, created_at")
    .eq("tool_name", "heygen")
    .in("run_id", renderTaskIds);

  const eventMap = new Map(
    (events ?? []).map((e) => [e.run_id, e])
  );

  // 3. Cross-reference
  const missing: Array<{
    video_id: string;
    render_task_id: string;
    status: string;
    created_at: string;
  }> = [];

  let totalTrackedUsd = 0;

  for (const video of videos) {
    const event = eventMap.get(video.render_task_id);
    if (event) {
      totalTrackedUsd += Number(event.cost_usd ?? 0);
    } else if (video.render_task_id) {
      missing.push({
        video_id: video.id,
        render_task_id: video.render_task_id,
        status: video.recording_status,
        created_at: video.created_at,
      });
    }
  }

  // 4. Estimate cost for missing videos (assume engine_iii, unknown duration)
  const estimatedMissingUsd = missing.length > 0
    ? missing.length * estimateHeyGenCost({ durationSeconds: 60 }).estimated_usd
    : 0;

  return NextResponse.json({
    ok: true,
    total_videos: videos.length,
    with_cost_event: videos.length - missing.length,
    missing_cost_event: missing.length,
    missing,
    total_tracked_usd: Math.round(totalTrackedUsd * 1_000_000) / 1_000_000,
    estimated_missing_usd: Math.round(estimatedMissingUsd * 1_000_000) / 1_000_000,
    days_lookback: days,
  });
}, { routeName: '/api/admin/finops/reconcile-heygen', feature: 'finops' });
