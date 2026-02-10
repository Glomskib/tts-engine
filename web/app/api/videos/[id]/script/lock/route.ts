/**
 * POST /api/videos/[id]/script/lock
 *
 * Locks the current script version, making it immutable.
 * Once locked, the content_hash serves as proof of immutability.
 *
 * Idempotent: locking an already-locked version returns success.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId, type ApiErrorCode } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { lockCurrentVersion } from "@/lib/video-script-versions";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: videoId } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID
  if (!UUID_REGEX.test(videoId)) {
    const err = apiError("INVALID_UUID", "Invalid video ID format", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Get auth context
  const authContext = await getApiAuthContext(request);
  const actor = authContext.user?.id || request.headers.get("x-actor") || "api";

  // Check video exists
  const { data: video, error: videoError } = await supabaseAdmin
    .from("videos")
    .select("id, status")
    .eq("id", videoId)
    .single();

  if (videoError || !video) {
    const err = apiError("NOT_FOUND", "Video not found", 404);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Lock the current version
  const result = await lockCurrentVersion(supabaseAdmin, {
    video_id: videoId,
    actor,
    correlation_id: correlationId,
  });

  if (!result.ok) {
    const errorMap: Record<string, { code: ApiErrorCode; status: number }> = {
      NO_SCRIPT: { code: "BAD_REQUEST", status: 400 },
      DB_ERROR: { code: "DB_ERROR", status: 500 },
    };

    const errorInfo = errorMap[result.error_code || "DB_ERROR"] || { code: "DB_ERROR" as ApiErrorCode, status: 500 };
    const err = apiError(errorInfo.code, result.message, errorInfo.status);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  return NextResponse.json({
    ok: true,
    data: result.version,
    meta: {
      message: result.message,
      content_hash: result.version?.content_hash,
      locked_at: result.version?.locked_at,
      locked_by: result.version?.locked_by,
    },
    correlation_id: correlationId,
  });
}
