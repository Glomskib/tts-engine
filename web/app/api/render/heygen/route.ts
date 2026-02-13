import { NextResponse } from "next/server";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { textToSpeech } from "@/lib/elevenlabs";
import { uploadAudio, generateVideo, pollUntilComplete } from "@/lib/heygen";
import { submitCompose } from "@/lib/compose";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logVideoActivity } from "@/lib/videoActivity";
import { sendTelegramNotification } from "@/lib/telegram";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const HeyGenSchema = z.object({
  videoId: z.string().uuid(),
  avatarId: z.string().optional(),
  voiceId: z.string().optional(),
});

/**
 * POST /api/render/heygen
 *
 * Generate a talking-head avatar video via HeyGen:
 * 1. Fetch video record + linked skit
 * 2. Build dialogue text from skit (hook_line + beat dialogues + cta_line)
 * 3. Generate TTS via ElevenLabs
 * 4. Upload audio to HeyGen
 * 5. Generate avatar video via HeyGen
 * 6. Poll until complete (up to 4 min)
 * 7. Download + re-host MP4 to Supabase
 * 8. If skit has overlays → submit Shotstack compose → cron finalizes
 *    If no overlays → set final_video_url directly → READY_FOR_REVIEW
 */
export async function POST(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // --- Auth ---
  const auth = await validateApiAccess(request);
  if (!auth) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // --- Parse body ---
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  const parsed = HeyGenSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse("VALIDATION_ERROR", "Invalid input", 400, correlationId, {
      issues: parsed.error.issues,
    });
  }

  const { videoId, avatarId, voiceId } = parsed.data;

  try {
    // --- Fetch video record ---
    const { data: video, error: videoErr } = await supabaseAdmin
      .from("videos")
      .select("id, recording_status, product_id")
      .eq("id", videoId)
      .single();

    if (videoErr || !video) {
      return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
    }

    if (video.recording_status !== "NOT_RECORDED" && video.recording_status !== "REJECTED") {
      return createApiErrorResponse(
        "INVALID_STATUS",
        `Video status is ${video.recording_status}, expected NOT_RECORDED or REJECTED`,
        409,
        correlationId
      );
    }

    // --- Fetch linked skit ---
    const { data: skit } = await supabaseAdmin
      .from("saved_skits")
      .select("skit_data")
      .eq("video_id", videoId)
      .single();

    if (!skit?.skit_data) {
      return createApiErrorResponse(
        "NOT_FOUND",
        "No skit linked to this video — generate a skit first",
        404,
        correlationId
      );
    }

    const skitData = skit.skit_data as {
      hook_line?: string;
      beats?: Array<{ dialogue?: string; on_screen_text?: string }>;
      cta_line?: string;
      cta_overlay?: string;
    };

    // --- Build dialogue text for TTS ---
    const ttsLines: string[] = [];
    if (skitData.hook_line) ttsLines.push(skitData.hook_line);
    for (const beat of skitData.beats || []) {
      if (beat.dialogue) ttsLines.push(beat.dialogue);
    }
    if (skitData.cta_line) ttsLines.push(skitData.cta_line);

    const ttsText = ttsLines.join(" ");
    if (!ttsText.trim()) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "Skit has no spoken dialogue for TTS",
        400,
        correlationId
      );
    }

    // --- Mark as rendering + save audit trail BEFORE external calls ---
    await supabaseAdmin
      .from("videos")
      .update({
        recording_status: "AI_RENDERING",
        render_prompt: ttsText,
        render_provider: "heygen",
      })
      .eq("id", videoId);

    console.log(`[${correlationId}] HeyGen render started for video ${videoId} (${ttsText.length} chars)`);

    // --- Step 1: Generate TTS via ElevenLabs ---
    const audioBuffer = await textToSpeech(ttsText, voiceId);
    console.log(`[${correlationId}] TTS generated: ${audioBuffer.byteLength} bytes`);

    // --- Step 2: Upload audio to HeyGen ---
    const { url: audioUrl } = await uploadAudio(audioBuffer);
    console.log(`[${correlationId}] Audio uploaded to HeyGen: ${audioUrl}`);

    // --- Step 3: Generate avatar video ---
    const { video_id: heygenVideoId } = await generateVideo(audioUrl, avatarId);
    console.log(`[${correlationId}] HeyGen video queued: ${heygenVideoId}`);

    // Save task ID immediately
    await supabaseAdmin
      .from("videos")
      .update({ render_task_id: heygenVideoId })
      .eq("id", videoId);

    // --- Step 4: Poll until complete (up to 4 min) ---
    const result = await pollUntilComplete(heygenVideoId);
    console.log(`[${correlationId}] HeyGen video completed: ${result.video_url}`);

    if (!result.video_url) {
      throw new Error("HeyGen completed but returned no video_url");
    }

    // --- Step 5: Download + re-host to Supabase ---
    const videoResp = await fetch(result.video_url);
    if (!videoResp.ok) throw new Error(`Failed to download HeyGen video: ${videoResp.status}`);

    const videoBuffer = await videoResp.arrayBuffer();
    const videoBlob = new Blob([videoBuffer], { type: "video/mp4" });
    const storagePath = `renders/heygen/${videoId}_${Date.now()}.mp4`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("renders")
      .upload(storagePath, videoBlob, { contentType: "video/mp4", upsert: true });

    if (uploadErr) throw new Error(`Supabase upload failed: ${uploadErr.message}`);

    const { data: urlData } = supabaseAdmin.storage.from("renders").getPublicUrl(storagePath);
    const rehostedUrl = urlData.publicUrl;

    console.log(`[${correlationId}] Video re-hosted: ${rehostedUrl}`);

    // --- Step 6: Compose or finalize directly ---
    // Check if skit has on-screen text or CTA overlays
    const textSegments = (skitData.beats || [])
      .map((b) => b.on_screen_text)
      .filter(Boolean) as string[];
    const onScreenText = textSegments.length ? textSegments.join("|") : undefined;
    const cta = skitData.cta_overlay || undefined;
    const hasOverlays = !!(onScreenText || cta);

    const updateFields: Record<string, unknown> = {
      runway_video_url: rehostedUrl,
    };

    if (hasOverlays) {
      // Submit Shotstack compose for text overlays (no additional audio — HeyGen bakes it in)
      const compose = await submitCompose({
        videoUrl: rehostedUrl,
        // No audioUrl — HeyGen video already has audio baked in
        onScreenText,
        cta,
        duration: result.duration ?? 10,
      });

      updateFields.compose_render_id = compose.renderId;
      console.log(`[${correlationId}] Shotstack compose submitted: ${compose.renderId}`);

      await supabaseAdmin
        .from("videos")
        .update(updateFields)
        .eq("id", videoId);

      await logVideoActivity(
        supabaseAdmin,
        videoId,
        "recording_status_changed",
        "AI_RENDERING",
        "AI_RENDERING",
        "system",
        `HeyGen video complete, Shotstack compose submitted for overlays`,
        correlationId
      );

      const productLabel = await getVideoProductLabel(videoId);
      sendTelegramNotification(
        `🎬 <b>HeyGen video composing</b>\nProduct: ${productLabel}\nVideo: <code>${videoId}</code>\nCompose: ${compose.renderId}`
      );

      const response = NextResponse.json(
        {
          ok: true,
          videoId,
          provider: "heygen",
          heygenVideoId,
          status: "composing",
          composeRenderId: compose.renderId,
          rehostedUrl,
          correlation_id: correlationId,
        },
        { status: 201 }
      );
      response.headers.set("x-correlation-id", correlationId);
      return response;
    } else {
      // No overlays — HeyGen video IS the final video
      updateFields.final_video_url = rehostedUrl;
      updateFields.recording_status = "READY_FOR_REVIEW";

      await supabaseAdmin
        .from("videos")
        .update(updateFields)
        .eq("id", videoId);

      await logVideoActivity(
        supabaseAdmin,
        videoId,
        "recording_status_changed",
        "AI_RENDERING",
        "READY_FOR_REVIEW",
        "system",
        `HeyGen avatar video render complete (no overlays, direct finalize)`,
        correlationId
      );

      const productLabel = await getVideoProductLabel(videoId);
      sendTelegramNotification(
        `🎬 <b>HeyGen video ready for review</b>\nProduct: ${productLabel}\nVideo: <code>${videoId}</code>`
      );

      const response = NextResponse.json(
        {
          ok: true,
          videoId,
          provider: "heygen",
          heygenVideoId,
          status: "ready_for_review",
          finalVideoUrl: rehostedUrl,
          correlation_id: correlationId,
        },
        { status: 201 }
      );
      response.headers.set("x-correlation-id", correlationId);
      return response;
    }
  } catch (err) {
    console.error(`[${correlationId}] HeyGen render error:`, err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "HeyGen render failed",
      500,
      correlationId
    );
  }
}

// --- Helper ---

async function getVideoProductLabel(videoId: string): Promise<string> {
  try {
    const { data: video } = await supabaseAdmin
      .from("videos")
      .select("product_id")
      .eq("id", videoId)
      .single();
    if (video?.product_id) {
      const { data: product } = await supabaseAdmin
        .from("products")
        .select("name, brand")
        .eq("id", video.product_id)
        .single();
      if (product?.name) {
        return product.brand ? `${product.brand} — ${product.name}` : product.name;
      }
    }
  } catch {
    // fall through
  }
  return videoId.slice(0, 8);
}
