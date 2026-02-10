/**
 * GET/POST /api/videos/[id]/assets
 *
 * GET: Returns all assets for a video, grouped by type
 * POST: Upserts an asset record (creates or updates)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  getVideoAssets,
  upsertVideoAsset,
  validateAssetInput,
  validateAssetsForPosting,
  generateCanonicalFileName,
  ASSET_TYPES,
  STORAGE_PROVIDERS,
  type AssetInput,
  type AssetType,
  type StorageProvider,
} from "@/lib/video-assets";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/videos/[id]/assets
 *
 * Returns:
 * - assets: Array of all active assets
 * - assets_by_type: Assets grouped by type
 * - has_final_mp4: Whether final deliverable exists
 * - ready_for_posting: Whether all required assets are present
 * - missing: List of missing required asset types
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: videoId } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID
  if (!UUID_REGEX.test(videoId)) {
    const err = apiError("INVALID_UUID", "Invalid video ID format", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Check video exists
  const { data: video, error: videoError } = await supabaseAdmin
    .from("videos")
    .select("id, status, account_id, variant_id")
    .eq("id", videoId)
    .single();

  if (videoError || !video) {
    const err = apiError("NOT_FOUND", "Video not found", 404);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Get assets
  const result = await getVideoAssets(supabaseAdmin, videoId);

  if (!result.ok) {
    const err = apiError("DB_ERROR", result.error || "Failed to fetch assets", 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate for posting readiness
  const postingCheck = validateAssetsForPosting(result.assets);

  return NextResponse.json({
    ok: true,
    data: {
      video_id: videoId,
      video_status: video.status,
      assets: result.assets,
      assets_by_type: postingCheck.assets_by_type,
      has_final_mp4: postingCheck.has_final_mp4,
      ready_for_posting: postingCheck.ok,
      missing: postingCheck.missing,
      asset_types: ASSET_TYPES,
      storage_providers: STORAGE_PROVIDERS,
    },
    correlation_id: correlationId,
  });
}

/**
 * POST /api/videos/[id]/assets
 *
 * Request body:
 * - asset_type: string (required) - one of ASSET_TYPES
 * - uri: string (required) - path or URL to the asset
 * - file_name: string (required) - original or canonical file name
 * - storage_provider: string (optional, default "local")
 * - mime_type: string (optional)
 * - byte_size: number (optional)
 * - checksum: string (optional)
 * - use_canonical_name: boolean (optional) - generate canonical name
 *
 * Returns the upserted asset record.
 * Emits video_events: asset_added or asset_updated
 */
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

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Check video exists and get identifiers for naming
  const { data: video, error: videoError } = await supabaseAdmin
    .from("videos")
    .select("id, status, account_id, variant_id")
    .eq("id", videoId)
    .single();

  if (videoError || !video) {
    const err = apiError("NOT_FOUND", "Video not found", 404);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Build input
  const input: Partial<AssetInput> = {
    asset_type: body.asset_type as AssetType,
    storage_provider: (body.storage_provider as StorageProvider) || "local",
    uri: body.uri as string,
    file_name: body.file_name as string,
    mime_type: body.mime_type as string | null,
    byte_size: typeof body.byte_size === "number" ? body.byte_size : null,
    checksum: body.checksum as string | null,
  };

  // Validate input
  const validation = validateAssetInput(input);
  if (!validation.ok) {
    const err = apiError("VALIDATION_ERROR", "Invalid asset data", 400, {
      errors: validation.errors,
    });
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Generate canonical name if requested
  let fileName = input.file_name!;
  let canonicalName: string | undefined;

  if (body.use_canonical_name === true) {
    // Get extension from original file name
    const ext = fileName.split(".").pop() || undefined;

    canonicalName = generateCanonicalFileName({
      video_id: videoId,
      variant_id: video.variant_id,
      account_id: video.account_id,
      asset_type: input.asset_type!,
      extension: ext,
    });

    fileName = canonicalName;
  }

  // Upsert the asset
  const result = await upsertVideoAsset(supabaseAdmin, {
    video_id: videoId,
    input: {
      ...input,
      file_name: fileName,
    } as AssetInput,
    actor,
    correlation_id: correlationId,
  });

  if (!result.ok) {
    const err = apiError("DB_ERROR", result.error || "Failed to save asset", 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  return NextResponse.json({
    ok: true,
    data: result.asset,
    meta: {
      action: result.action,
      canonical_name: canonicalName,
    },
    correlation_id: correlationId,
  });
}
