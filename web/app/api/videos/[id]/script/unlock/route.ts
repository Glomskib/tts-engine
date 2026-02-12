/**
 * POST /api/videos/[id]/script/unlock
 *
 * Unlocks the current script version (admin-only operation).
 * This is a privileged operation that should be used sparingly.
 *
 * Idempotent: unlocking an already-unlocked version returns success.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId, type ApiErrorCode } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { unlockCurrentVersion } from "@/lib/video-script-versions";

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
    return createApiErrorResponse("INVALID_UUID", "Invalid video ID format", 400, correlationId);
  }

  // Get auth context - must be admin
  const authContext = await getApiAuthContext(request);
  const actor = authContext.user?.id || request.headers.get("x-actor") || "api";
  const isAdmin = authContext.isAdmin;

  if (!isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin privileges required to unlock script versions", 403, correlationId);
  }

  // Check video exists
  const { data: video, error: videoError } = await supabaseAdmin
    .from("videos")
    .select("id, status")
    .eq("id", videoId)
    .single();

  if (videoError || !video) {
    return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
  }

  // Unlock the current version
  const result = await unlockCurrentVersion(supabaseAdmin, {
    video_id: videoId,
    actor,
    correlation_id: correlationId,
    is_admin: true,
  });

  if (!result.ok) {
    const errorMap: Record<string, { code: ApiErrorCode; status: number }> = {
      FORBIDDEN: { code: "FORBIDDEN", status: 403 },
      NO_SCRIPT: { code: "BAD_REQUEST", status: 400 },
      DB_ERROR: { code: "DB_ERROR", status: 500 },
    };

    const errorInfo = errorMap[result.error_code || "DB_ERROR"] || { code: "DB_ERROR" as ApiErrorCode, status: 500 };
    return createApiErrorResponse(errorInfo.code, result.message, errorInfo.status, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: result.version,
    meta: {
      message: result.message,
      unlocked_by: actor,
    },
    correlation_id: correlationId,
  });
}
