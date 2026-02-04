/**
 * GET /api/videos/[id]/details
 *
 * Unified endpoint to power the video details drawer.
 * Returns video details, brief info, script, assets, and recent events.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: videoId } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID
  if (!UUID_REGEX.test(videoId)) {
    const err = apiError("INVALID_UUID", "Invalid video ID format", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    // Fetch video with related data
    const { data: video, error: videoError } = await supabaseAdmin
      .from("videos")
      .select(`
        *,
        concept:concept_id (
          id,
          title,
          core_angle,
          hypothesis,
          proof_type,
          hook_options,
          notes,
          status,
          visual_hook,
          on_screen_text_hook,
          on_screen_text_mid,
          on_screen_text_cta,
          hook_type,
          reference_script,
          reference_video_url,
          tone_preset
        ),
        product:product_id (
          id,
          name,
          brand,
          sku,
          product_url
        ),
        account:account_id (
          id,
          name,
          platform
        ),
        posting_account:posting_account_id (
          id,
          display_name,
          account_code,
          platform
        )
      `)
      .eq("id", videoId)
      .single();

    if (videoError || !video) {
      const err = apiError("NOT_FOUND", "Video not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Fetch script if there's a locked script
    let script = null;
    if (video.script_locked_text) {
      // Script is already embedded in video via script_locked_text and script_locked_version
      script = {
        text: video.script_locked_text,
        version: video.script_locked_version,
        locked: true,
      };
    }

    // Build brief from concept data
    let brief = null;
    if (video.concept) {
      brief = {
        concept_id: video.concept.id,
        title: video.concept.title,
        angle: video.concept.core_angle,
        hypothesis: video.concept.hypothesis,
        proof_type: video.concept.proof_type,
        hook_options: video.concept.hook_options,
        notes: video.concept.notes,
        status: video.concept.status,
        // Hook Package fields
        visual_hook: video.concept.visual_hook || null,
        on_screen_text_hook: video.concept.on_screen_text_hook || null,
        on_screen_text_mid: video.concept.on_screen_text_mid || null,
        on_screen_text_cta: video.concept.on_screen_text_cta || null,
        hook_type: video.concept.hook_type || null,
        // Reference fields
        reference_script: video.concept.reference_script || null,
        reference_video_url: video.concept.reference_video_url || null,
        tone_preset: video.concept.tone_preset || null,
      };
    }

    // Fetch assets (video assets table if exists)
    const assets: {
      raw_footage_url: string | null;
      final_mp4_url: string | null;
      thumbnail_url: string | null;
      google_drive_url: string | null;
      screenshots: string[];
    } = {
      raw_footage_url: null,
      final_mp4_url: video.final_video_url || null,
      thumbnail_url: null,
      google_drive_url: video.google_drive_url || null,
      screenshots: [],
    };

    // Try to fetch from video_assets table
    const { data: videoAssets } = await supabaseAdmin
      .from("video_assets")
      .select("*")
      .eq("video_id", videoId);

    if (videoAssets && videoAssets.length > 0) {
      for (const asset of videoAssets) {
        if (asset.asset_type === "raw_footage") {
          assets.raw_footage_url = asset.url;
        } else if (asset.asset_type === "final_mp4") {
          assets.final_mp4_url = asset.url;
        } else if (asset.asset_type === "thumbnail") {
          assets.thumbnail_url = asset.url;
        } else if (asset.asset_type === "screenshot") {
          assets.screenshots.push(asset.url);
        }
      }
    }

    // Fetch recent events (last 10)
    const { data: events } = await supabaseAdmin
      .from("video_events")
      .select("id, event_type, from_status, to_status, actor, details, created_at")
      .eq("video_id", videoId)
      .order("created_at", { ascending: false })
      .limit(10);

    // Fetch posting metadata
    let postingMeta = null;
    const { data: postingData } = await supabaseAdmin
      .from("videos")
      .select("posting_meta")
      .eq("id", videoId)
      .single();

    if (postingData?.posting_meta) {
      postingMeta = postingData.posting_meta;
    }

    // Build response
    return NextResponse.json({
      ok: true,
      video: {
        id: video.id,
        variant_id: video.variant_id,
        account_id: video.account_id,
        status: video.status,
        recording_status: video.recording_status,
        created_at: video.created_at,
        last_status_changed_at: video.last_status_changed_at,
        claimed_by: video.claimed_by,
        claimed_at: video.claimed_at,
        claim_expires_at: video.claim_expires_at,
        claim_role: video.claim_role,
        posted_url: video.posted_url,
        posted_platform: video.posted_platform,
        google_drive_url: video.google_drive_url,
        final_video_url: video.final_video_url,
        concept_id: video.concept_id,
        product_id: video.product_id,
        // Denormalized for convenience
        brand_name: video.product?.brand || null,
        product_name: video.product?.name || null,
        product_sku: video.product?.sku || null,
        account_name: video.account?.name || null,
        account_platform: video.account?.platform || null,
        // Posting account
        posting_account_id: video.posting_account_id || null,
        posting_account_name: video.posting_account?.display_name || null,
        posting_account_code: video.posting_account?.account_code || null,
      },
      brief,
      script,
      assets,
      events: events || [],
      posting_meta: postingMeta,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/videos/[id]/details error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
