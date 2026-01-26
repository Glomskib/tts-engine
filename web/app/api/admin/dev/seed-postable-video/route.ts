/**
 * POST /api/admin/dev/seed-postable-video
 *
 * Admin-only endpoint to create a fully postable test video in one request.
 * Creates or reuses a video with:
 * - Status: ready_to_post
 * - Locked script with required fields (sku, link, caption, hashtags)
 * - posting_meta.target_account set
 * - final_mp4 asset present
 *
 * Idempotent: Returns existing seeded video if still in ready_to_post status.
 *
 * PowerShell usage:
 * ```powershell
 * # 1. Seed a postable test video
 * $seed = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/dev/seed-postable-video" `
 *   -Method POST -ContentType "application/json" -WebSession $session
 * $seed
 *
 * # 2. Visit /uploader in browser - you should see a "Ready" row with green Post button
 *
 * # 3. After marking posted, reset the video to test again:
 * $reset = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/dev/reset-video-ready" `
 *   -Method POST -ContentType "application/json" `
 *   -Body "{`"video_id`": `"$($seed.data.video_id)`"}" -WebSession $session
 * $reset
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createScriptVersion, lockCurrentVersion } from "@/lib/video-script-versions";

export const runtime = "nodejs";

// Dev seed configuration
const SEED_TARGET_ACCOUNT = "@dev_test_account";
const DEV_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";

async function writeVideoEvent(params: {
  video_id: string;
  event_type: string;
  correlation_id: string;
  actor: string;
  from_status: string | null;
  to_status: string | null;
  details: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabaseAdmin.from("video_events").insert({
      video_id: params.video_id,
      event_type: params.event_type,
      correlation_id: params.correlation_id,
      actor: params.actor,
      from_status: params.from_status,
      to_status: params.to_status,
      details: params.details,
    });
  } catch (err) {
    console.error("Failed to write video event:", err);
  }
}

export async function POST(request: NextRequest) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Admin-only access
  const authContext = await getApiAuthContext();
  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const actor = authContext.user?.id || "admin";

  try {
    // Step 1: Find an existing variant to use (required by FK constraint)
    const { data: existingVariant } = await supabaseAdmin
      .from("variants")
      .select("id, concept_id")
      .limit(1)
      .single();

    if (!existingVariant) {
      const err = apiError("PRECONDITION_FAILED", "No variants exist. Create at least one variant first.", 422);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const variantId = existingVariant.id;

    // Check for existing dev-seeded video that's still ready_to_post
    // We identify dev seeds by google_drive_url containing "dev-seed"
    const { data: existing } = await supabaseAdmin
      .from("videos")
      .select("id, status, posting_meta, variant_id")
      .like("google_drive_url", "%dev-seed%")
      .eq("status", "ready_to_post")
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Verify it has all required components
      const { count: assetCount } = await supabaseAdmin
        .from("video_assets")
        .select("*", { count: "exact", head: true })
        .eq("video_id", existing.id)
        .eq("asset_type", "final_mp4")
        .is("deleted_at", null);

      const { data: scriptPointer } = await supabaseAdmin
        .from("video_scripts")
        .select("current_version_id")
        .eq("video_id", existing.id)
        .maybeSingle();

      let hasLockedScript = false;
      if (scriptPointer?.current_version_id) {
        const { data: version } = await supabaseAdmin
          .from("video_script_versions")
          .select("locked_at")
          .eq("id", scriptPointer.current_version_id)
          .single();
        hasLockedScript = !!version?.locked_at;
      }

      const postingMeta = existing.posting_meta as { target_account?: string } | null;
      const hasTargetAccount = !!postingMeta?.target_account;

      if ((assetCount || 0) > 0 && hasLockedScript && hasTargetAccount) {
        // Existing video is fully ready - return it
        await writeVideoEvent({
          video_id: existing.id,
          event_type: "dev_seed_reused",
          correlation_id: correlationId,
          actor,
          from_status: "ready_to_post",
          to_status: "ready_to_post",
          details: { idempotent: true },
        });

        return NextResponse.json({
          ok: true,
          data: {
            video_id: existing.id,
            status: "ready_to_post",
            target_account: postingMeta?.target_account,
            ready: true,
            reused: true,
          },
          correlation_id: correlationId,
        });
      }
    }

    // Create a new seeded video using the found variant

    // Step 2: Create the video
    const { data: video, error: videoError } = await supabaseAdmin
      .from("videos")
      .insert({
        account_id: DEV_ACCOUNT_ID,
        variant_id: variantId,
        google_drive_url: "https://drive.google.com/dev-seed-" + Date.now(),
        status: "ready_to_post",
        posting_meta: {
          target_account: SEED_TARGET_ACCOUNT,
        },
      })
      .select()
      .single();

    if (videoError || !video) {
      console.error("Failed to create seed video:", videoError);
      const err = apiError("DB_ERROR", `Failed to create video: ${videoError?.message}`, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    await writeVideoEvent({
      video_id: video.id,
      event_type: "dev_seed_video_created",
      correlation_id: correlationId,
      actor,
      from_status: null,
      to_status: "ready_to_post",
      details: { variant_id: variantId, dev_seed: true },
    });

    // Step 3: Create and lock a script version with all required fields
    const scriptContent = {
      script_text: "This is a dev seed test script for posting workflow testing.",
      caption: "Amazing test product! Check out our limited offer.",
      hashtags: ["#test", "#dev", "#tiktok", "#viral"],
      product_sku: "DEV-SKU-001",
      product_link: "https://example.com/product/dev-test",
      compliance_notes: "Dev seed - no real compliance review needed.",
    };

    const createResult = await createScriptVersion(supabaseAdmin, {
      video_id: video.id,
      content: scriptContent,
      actor,
      correlation_id: correlationId,
    });

    if (!createResult.ok) {
      console.error("Failed to create script version:", createResult.message);
      // Continue anyway - video is created
    }

    // Lock the script
    const lockResult = await lockCurrentVersion(supabaseAdmin, {
      video_id: video.id,
      actor,
      correlation_id: correlationId,
    });

    if (!lockResult.ok) {
      console.error("Failed to lock script:", lockResult.message);
      // Continue anyway
    }

    // Step 4: Add a final_mp4 asset
    const { data: asset, error: assetError } = await supabaseAdmin
      .from("video_assets")
      .insert({
        video_id: video.id,
        asset_type: "final_mp4",
        uri: "https://storage.example.com/dev-seed/test-video.mp4",
        file_name: "dev-seed-test-video.mp4",
        storage_provider: "dev",
        mime_type: "video/mp4",
        byte_size: 1024000,
      })
      .select()
      .single();

    if (assetError) {
      console.error("Failed to create asset:", assetError);
      // Continue anyway - video and script exist
    }

    await writeVideoEvent({
      video_id: video.id,
      event_type: "dev_seed_complete",
      correlation_id: correlationId,
      actor,
      from_status: "ready_to_post",
      to_status: "ready_to_post",
      details: {
        script_version_id: createResult.version?.id,
        script_locked: lockResult.ok,
        asset_id: asset?.id,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        video_id: video.id,
        status: "ready_to_post",
        target_account: SEED_TARGET_ACCOUNT,
        ready: true,
        reused: false,
        script_version_id: createResult.version?.id,
        asset_id: asset?.id,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("POST /api/admin/dev/seed-postable-video error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
