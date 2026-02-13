import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createImageToVideo, createTextToVideo } from "@/lib/runway";
import { logVideoActivity } from "@/lib/videoActivity";

export const runtime = "nodejs";
export const maxDuration = 120;

interface RouteParams {
  params: Promise<{ video_id: string }>;
}

/**
 * POST /api/admin/videos/[video_id]/re-render
 *
 * Re-triggers a Runway render for an existing video.
 * Finds the linked skit, rebuilds the Runway prompt, triggers a new render,
 * and updates the video with the new render_task_id.
 *
 * Works for videos in NOT_RECORDED or REJECTED status.
 * Auth: API key or admin session required.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { video_id } = await params;
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(video_id)) {
    return createApiErrorResponse(
      "INVALID_UUID",
      "Invalid video ID format",
      400,
      correlationId
    );
  }

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId
    );
  }

  try {
    // 1. Fetch the video
    const { data: video, error: videoErr } = await supabaseAdmin
      .from("videos")
      .select("*")
      .eq("id", video_id)
      .single();

    if (videoErr || !video) {
      return createApiErrorResponse(
        "NOT_FOUND",
        "Video not found",
        404,
        correlationId
      );
    }

    // Only allow re-render from NOT_RECORDED, REJECTED, or AI_RENDERING (stuck)
    const allowedStatuses = ["NOT_RECORDED", "REJECTED", "AI_RENDERING"];
    if (!allowedStatuses.includes(video.recording_status)) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        `Cannot re-render video in ${video.recording_status} status. Allowed: ${allowedStatuses.join(", ")}`,
        400,
        correlationId
      );
    }

    // 2. Find the linked skit
    const { data: skit, error: skitErr } = await supabaseAdmin
      .from("saved_skits")
      .select(
        "id, title, product_id, product_name, skit_data, generation_config"
      )
      .eq("video_id", video_id)
      .single();

    if (skitErr || !skit) {
      return createApiErrorResponse(
        "NOT_FOUND",
        "No linked skit found for this video. Re-render requires a linked UGC_SHORT skit.",
        404,
        correlationId
      );
    }

    const generationConfig = skit.generation_config as {
      content_type?: string;
    } | null;
    if (generationConfig?.content_type !== "ugc_short") {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "Linked skit is not UGC_SHORT type. Only UGC_SHORT skits support AI re-render.",
        400,
        correlationId
      );
    }

    const skitData = skit.skit_data as {
      hook_line: string;
      beats: Array<{
        t: string;
        action: string;
        dialogue?: string;
        on_screen_text?: string;
      }>;
      cta_line: string;
      cta_overlay: string;
    };

    if (!skitData.beats || skitData.beats.length === 0) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "Skit has no beats/scenes to build a Runway prompt from.",
        400,
        correlationId
      );
    }

    // 3. Fetch product image
    const productId = skit.product_id || video.product_id;
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("product_image_url, name")
      .eq("id", productId)
      .single();

    const productName = product?.name || skit.product_name || "the product";
    let productImageUrl = product?.product_image_url;

    // 4. Build Runway prompt (matches batch-render prompt style)
    const sceneDescriptions = skitData.beats
      .map((b) => b.action)
      .filter(Boolean)
      .join(" ");

    const runwayPrompt = `Close-up product-focused vertical video. ${productName} prominently featured in center of frame. Person holding product at chest height, clearly showing label. ${sceneDescriptions} Natural indoor lighting, casual setting. Smartphone-shot feel, 9:16 vertical.`;

    // 5. Re-host product image to Supabase if external
    if (productImageUrl && !productImageUrl.includes("supabase.co")) {
      try {
        const imgResp = await fetch(productImageUrl);
        if (imgResp.ok) {
          const contentType =
            imgResp.headers.get("content-type") || "image/jpeg";
          const ext = contentType.includes("png")
            ? "png"
            : contentType.includes("webp")
              ? "webp"
              : "jpg";
          const imgBuffer = await imgResp.arrayBuffer();
          const imgBlob = new Blob([imgBuffer], { type: contentType });
          const imgPath = `product-images/${productId}_${Date.now()}.${ext}`;

          const { error: uploadErr } = await supabaseAdmin.storage
            .from("renders")
            .upload(imgPath, imgBlob, { contentType, upsert: true });

          if (!uploadErr) {
            const { data: urlData } = supabaseAdmin.storage
              .from("renders")
              .getPublicUrl(imgPath);
            productImageUrl = urlData.publicUrl;
          }
        }
      } catch {
        // Non-blocking — fall back to original URL
      }
    }

    // 6. Trigger Runway render
    let runwayResult: { id?: string };
    if (productImageUrl) {
      runwayResult = await createImageToVideo(
        productImageUrl,
        runwayPrompt,
        "gen4.5",
        10
      );
    } else {
      runwayResult = await createTextToVideo(runwayPrompt, "gen4.5", 10);
    }

    const renderTaskId = runwayResult.id ? String(runwayResult.id) : null;

    if (!renderTaskId) {
      return createApiErrorResponse(
        "INTERNAL",
        "Runway returned no task ID",
        500,
        correlationId
      );
    }

    // 7. Update video: new render_task_id, clear old compose data, set AI_RENDERING
    const { error: updateErr } = await supabaseAdmin
      .from("videos")
      .update({
        render_task_id: renderTaskId,
        render_provider: "runway",
        compose_render_id: null,
        runway_video_url: null,
        final_video_url: null,
        recording_status: "AI_RENDERING",
        rejection_reason: null,
        review_notes: null,
        last_status_changed_at: new Date().toISOString(),
      })
      .eq("id", video_id);

    if (updateErr) {
      console.error(
        `[${correlationId}] Failed to update video after re-render trigger:`,
        updateErr
      );
      return createApiErrorResponse(
        "DB_ERROR",
        "Runway render triggered but failed to update video record",
        500,
        correlationId,
        { render_task_id: renderTaskId }
      );
    }

    await logVideoActivity(
      supabaseAdmin,
      video_id,
      "recording_status_changed",
      video.recording_status,
      "AI_RENDERING",
      authContext.user.id,
      `Re-render triggered (task: ${renderTaskId}, previous: ${video.recording_status})`,
      correlationId
    );

    return NextResponse.json({
      ok: true,
      data: {
        video_id,
        render_task_id: renderTaskId,
        render_provider: "runway",
        product_name: productName,
        previous_status: video.recording_status,
        new_status: "AI_RENDERING",
        prompt_length: runwayPrompt.length,
        had_product_image: !!productImageUrl,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(
      `[${correlationId}] POST /api/admin/videos/[video_id]/re-render error:`,
      err
    );
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Failed to trigger re-render",
      500,
      correlationId
    );
  }
}
