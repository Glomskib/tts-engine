/**
 * DELETE /api/videos/[id]/assets/[assetId]
 *
 * Soft deletes an asset record.
 * Only the asset creator or admin can delete.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId, type ApiErrorCode } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { deleteVideoAsset, getAssetById } from "@/lib/video-assets";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string; assetId: string }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/videos/[id]/assets/[assetId]
 *
 * Returns a single asset by ID.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: videoId, assetId } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUIDs
  if (!UUID_REGEX.test(videoId)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid video ID format", 400, correlationId);
  }

  if (!UUID_REGEX.test(assetId)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid asset ID format", 400, correlationId);
  }

  // Get asset
  const result = await getAssetById(supabaseAdmin, assetId);

  if (!result.ok || !result.asset) {
    return createApiErrorResponse("NOT_FOUND", result.error || "Asset not found", 404, correlationId);
  }

  // Verify asset belongs to video
  if (result.asset.video_id !== videoId) {
    return createApiErrorResponse("NOT_FOUND", "Asset not found for this video", 404, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: result.asset,
    correlation_id: correlationId,
  });
}

/**
 * DELETE /api/videos/[id]/assets/[assetId]
 *
 * Soft deletes an asset record.
 * Only the asset creator or admin can delete.
 * Emits video_events: asset_removed
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: videoId, assetId } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUIDs
  if (!UUID_REGEX.test(videoId)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid video ID format", 400, correlationId);
  }

  if (!UUID_REGEX.test(assetId)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid asset ID format", 400, correlationId);
  }

  // Get auth context
  const authContext = await getApiAuthContext(request);
  const actor = authContext.user?.id || request.headers.get("x-actor") || "api";
  const isAdmin = authContext.isAdmin;

  // Check video exists
  const { data: video, error: videoError } = await supabaseAdmin
    .from("videos")
    .select("id")
    .eq("id", videoId)
    .single();

  if (videoError || !video) {
    return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
  }

  // Delete the asset
  const result = await deleteVideoAsset(supabaseAdmin, {
    asset_id: assetId,
    video_id: videoId,
    actor,
    correlation_id: correlationId,
    is_admin: isAdmin,
  });

  if (!result.ok) {
    const errorMap: Record<string, { code: ApiErrorCode; status: number }> = {
      "Asset not found": { code: "NOT_FOUND", status: 404 },
      "Not authorized to delete this asset": { code: "FORBIDDEN", status: 403 },
    };

    const errorInfo = errorMap[result.error || ""] || { code: "DB_ERROR" as ApiErrorCode, status: 500 };
    return createApiErrorResponse(errorInfo.code, result.error || "Failed to delete asset", errorInfo.status, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: {
      deleted: true,
      asset_id: assetId,
      video_id: videoId,
    },
    correlation_id: correlationId,
  });
}
