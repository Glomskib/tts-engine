/**
 * GET /api/uploader/queue
 *
 * Returns videos ready for posting with all required posting fields.
 * Optimized for daily uploader workflow - batch fetches all related data.
 *
 * Query params:
 * - status: "ready_to_post" | "needs_edit" (default: ready_to_post)
 * - target_account: filter by target account
 * - missing_only: "true" to show only videos with missing fields
 * - done: "0" (default) = only not done, "1" = only completed, "all" = both
 * - limit: number (default: 100, max: 500)
 * - offset: number (default: 0)
 *
 * Response per video:
 * - video_id, status, created_at
 * - locked script fields: product_sku, product_link, caption, hashtags
 * - posting_meta: target_account, compliance_notes, uploader_checklist_completed_at
 * - assets: final_mp4_uri, thumbnail_uri
 * - readiness: has_locked_script, posting_meta_complete, has_final_mp4
 * - missing_fields: array of missing required fields
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { type VideoStatus } from "@/lib/video-pipeline";
import { validatePostingMetaCompleteness, type CompletePostingMeta } from "@/lib/posting-meta";

export const runtime = "nodejs";

interface UploaderQueueVideo {
  video_id: string;
  status: VideoStatus;
  created_at: string;
  // Script-derived fields
  product_sku: string | null;
  product_link: string | null;
  caption: string | null;
  hashtags: string[] | null;
  compliance_notes: string | null;
  // Posting meta
  target_account: string | null;
  uploader_checklist_completed_at: string | null;
  // Assets
  final_mp4_uri: string | null;
  thumbnail_uri: string | null;
  // Readiness
  has_locked_script: boolean;
  posting_meta_complete: boolean;
  has_final_mp4: boolean;
  missing_fields: string[];
}

const VALID_STATUSES = ["ready_to_post", "needs_edit"] as const;
type QueueStatus = (typeof VALID_STATUSES)[number];

export async function GET(request: NextRequest) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Access control: admin or uploader
  const authContext = await getApiAuthContext();
  if (!authContext.isUploader) {
    const err = apiError("FORBIDDEN", "Uploader or admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Parse query params
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status") || "ready_to_post";
  const targetAccountFilter = searchParams.get("target_account");
  const missingOnly = searchParams.get("missing_only") === "true";
  const doneParam = searchParams.get("done") || "0"; // "0" = not done (default), "1" = done, "all" = both
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "100", 10), 1), 500);
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

  // Validate status
  if (!VALID_STATUSES.includes(statusParam as QueueStatus)) {
    const err = apiError("BAD_REQUEST", `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`, 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }
  const status = statusParam as QueueStatus;

  try {
    // Step 1: Fetch videos with posting_meta (efficient single query)
    let videosQuery = supabaseAdmin
      .from("videos")
      .select("id, status, created_at, posting_meta", { count: "exact" })
      .eq("status", status)
      .order("created_at", { ascending: true });

    // Apply target_account filter if provided
    if (targetAccountFilter) {
      videosQuery = videosQuery.filter("posting_meta->>target_account", "eq", targetAccountFilter);
    }

    // Apply done filter based on uploader_checklist_completed_at
    if (doneParam === "0") {
      // Not done: uploader_checklist_completed_at is null
      videosQuery = videosQuery.is("posting_meta->uploader_checklist_completed_at", null);
    } else if (doneParam === "1") {
      // Done: uploader_checklist_completed_at is not null
      videosQuery = videosQuery.not("posting_meta->uploader_checklist_completed_at", "is", null);
    }
    // "all" = no filter applied

    const { data: videos, count: totalCount, error: videosError } = await videosQuery
      .range(offset, offset + limit - 1);

    if (videosError) {
      const err = apiError("DB_ERROR", `Failed to fetch videos: ${videosError.message}`, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    if (!videos || videos.length === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          videos: [],
          total: 0,
          limit,
          offset,
          filters: { status, target_account: targetAccountFilter, missing_only: missingOnly, done: doneParam },
        },
        correlation_id: correlationId,
      });
    }

    const videoIds = videos.map((v) => v.id);

    // Step 2: Batch fetch locked script versions (via video_scripts + video_script_versions)
    // First get the current version pointers
    const { data: scriptPointers } = await supabaseAdmin
      .from("video_scripts")
      .select("video_id, current_version_id")
      .in("video_id", videoIds);

    const versionIds = (scriptPointers || [])
      .filter((p) => p.current_version_id)
      .map((p) => p.current_version_id);

    // Then fetch the versions themselves (only locked ones matter)
    let lockedScriptsMap: Map<string, {
      product_sku: string | null;
      product_link: string | null;
      caption: string | null;
      hashtags: string[] | null;
      compliance_notes: string | null;
    }> = new Map();

    if (versionIds.length > 0) {
      const { data: versions } = await supabaseAdmin
        .from("video_script_versions")
        .select("id, video_id, product_sku, product_link, caption, hashtags, compliance_notes, locked_at")
        .in("id", versionIds)
        .not("locked_at", "is", null);

      for (const v of versions || []) {
        lockedScriptsMap.set(v.video_id, {
          product_sku: v.product_sku,
          product_link: v.product_link,
          caption: v.caption,
          hashtags: v.hashtags,
          compliance_notes: v.compliance_notes,
        });
      }
    }

    // Step 3: Batch fetch assets (final_mp4 and thumbnail)
    const { data: assets } = await supabaseAdmin
      .from("video_assets")
      .select("video_id, asset_type, uri")
      .in("video_id", videoIds)
      .in("asset_type", ["final_mp4", "thumbnail"])
      .is("deleted_at", null);

    const assetsMap: Map<string, { final_mp4_uri: string | null; thumbnail_uri: string | null }> = new Map();
    for (const videoId of videoIds) {
      assetsMap.set(videoId, { final_mp4_uri: null, thumbnail_uri: null });
    }
    for (const asset of assets || []) {
      const entry = assetsMap.get(asset.video_id);
      if (entry) {
        if (asset.asset_type === "final_mp4") {
          entry.final_mp4_uri = asset.uri;
        } else if (asset.asset_type === "thumbnail") {
          entry.thumbnail_uri = asset.uri;
        }
      }
    }

    // Step 4: Build response objects
    const result: UploaderQueueVideo[] = [];

    for (const video of videos) {
      const postingMeta = video.posting_meta as { target_account?: string; uploader_checklist_completed_at?: string } | null;
      const lockedScript = lockedScriptsMap.get(video.id);
      const videoAssets = assetsMap.get(video.id) || { final_mp4_uri: null, thumbnail_uri: null };

      const hasLockedScript = !!lockedScript;
      const hasFinalMp4 = !!videoAssets.final_mp4_uri;

      // Build complete posting meta for validation
      const completeMeta: Partial<CompletePostingMeta> = {
        product_sku: lockedScript?.product_sku || null,
        product_link: lockedScript?.product_link || null,
        caption: lockedScript?.caption || null,
        hashtags: lockedScript?.hashtags || null,
        compliance_notes: lockedScript?.compliance_notes || null,
        target_account: postingMeta?.target_account || null,
        uploader_checklist_completed_at: postingMeta?.uploader_checklist_completed_at || null,
      };

      const validation = validatePostingMetaCompleteness(completeMeta);
      const postingMetaComplete = validation.ok;

      const item: UploaderQueueVideo = {
        video_id: video.id,
        status: video.status as VideoStatus,
        created_at: video.created_at,
        product_sku: lockedScript?.product_sku || null,
        product_link: lockedScript?.product_link || null,
        caption: lockedScript?.caption || null,
        hashtags: lockedScript?.hashtags || null,
        compliance_notes: lockedScript?.compliance_notes || null,
        target_account: postingMeta?.target_account || null,
        uploader_checklist_completed_at: postingMeta?.uploader_checklist_completed_at || null,
        final_mp4_uri: videoAssets.final_mp4_uri,
        thumbnail_uri: videoAssets.thumbnail_uri,
        has_locked_script: hasLockedScript,
        posting_meta_complete: postingMetaComplete,
        has_final_mp4: hasFinalMp4,
        missing_fields: validation.missing,
      };

      // Apply missing_only filter
      if (missingOnly && validation.missing.length === 0) {
        continue;
      }

      result.push(item);
    }

    // Get unique target accounts for filter dropdown
    const targetAccounts = new Set<string>();
    for (const video of videos) {
      const pm = video.posting_meta as { target_account?: string } | null;
      if (pm?.target_account) {
        targetAccounts.add(pm.target_account);
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        videos: result,
        total: missingOnly ? result.length : (totalCount || 0),
        limit,
        offset,
        filters: {
          status,
          target_account: targetAccountFilter,
          missing_only: missingOnly,
          done: doneParam,
        },
        available_target_accounts: Array.from(targetAccounts).sort(),
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/uploader/queue error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
