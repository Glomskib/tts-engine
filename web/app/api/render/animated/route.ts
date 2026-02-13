import { NextResponse } from "next/server";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { textToSpeech } from "@/lib/elevenlabs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadToStorage } from "@/lib/storage";
import { logVideoActivity } from "@/lib/videoActivity";
import { sendTelegramNotification } from "@/lib/telegram";
import { z } from "zod";
import { writeFile, readFile, mkdir, unlink } from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 300;

const BROWSER_SERVICE_URL =
  process.env.BROWSER_SERVICE_URL || "http://localhost:8100";
const BROWSER_SERVICE_KEY =
  process.env.BROWSER_SERVICE_KEY || "bsk_changeme";

const AnimatedSchema = z.object({
  productId: z.string().uuid(),
  scriptText: z.string().min(1).max(10000).optional(),
  voiceId: z.string().optional(),
});

/**
 * POST /api/render/animated
 *
 * End-to-end animated character video creation pipeline:
 * 1. Accept productId, optional scriptText and voiceId
 * 2. If no scriptText, fetch the product's latest UGC_SHORT skit
 * 3. Generate TTS audio via ElevenLabs
 * 4. Save audio to Supabase storage
 * 5. Call browser service to create animated video
 * 6. Upload finished video to Supabase storage
 * 7. Update video record with render_url
 * 8. Set recording_status to READY_FOR_REVIEW
 * 9. Send Telegram notification
 */
export async function POST(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // --- Auth ---
  const auth = await validateApiAccess(request);
  if (!auth) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId
    );
  }

  // --- Parse body ---
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Invalid JSON body",
      400,
      correlationId
    );
  }

  const parsed = AnimatedSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse(
      "VALIDATION_ERROR",
      "Invalid input",
      400,
      correlationId,
      { issues: parsed.error.issues }
    );
  }

  const { productId, voiceId } = parsed.data;
  let { scriptText } = parsed.data;

  try {
    // --- Verify product exists ---
    const { data: product, error: productErr } = await supabaseAdmin
      .from("products")
      .select("id, name, brand")
      .eq("id", productId)
      .single();

    if (productErr || !product) {
      return createApiErrorResponse(
        "NOT_FOUND",
        "Product not found",
        404,
        correlationId
      );
    }

    // --- Find or create video record for this product ---
    // Look for an existing video in AI_RENDERING or NOT_RECORDED state
    const { data: existingVideo } = await supabaseAdmin
      .from("videos")
      .select("id, recording_status")
      .eq("product_id", productId)
      .in("recording_status", ["NOT_RECORDED", "NEEDS_SCRIPT"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let videoId: string;

    if (existingVideo) {
      videoId = existingVideo.id;
    } else {
      // Create a new video record
      const { data: newVideo, error: videoCreateErr } = await supabaseAdmin
        .from("videos")
        .insert({
          product_id: productId,
          status: "needs_edit",
          recording_status: "AI_RENDERING",
          script_not_required: true,
          google_drive_url: "",
        })
        .select("id")
        .single();

      if (videoCreateErr || !newVideo) {
        return createApiErrorResponse(
          "DB_ERROR",
          "Failed to create video record",
          500,
          correlationId
        );
      }
      videoId = newVideo.id;
    }

    // Mark video as AI_RENDERING
    await supabaseAdmin
      .from("videos")
      .update({
        recording_status: "AI_RENDERING",
        render_provider: "animated",
      })
      .eq("id", videoId);

    console.log(
      `[${correlationId}] Animated render started for product ${product.name} (video: ${videoId})`
    );

    // --- Step 1: Resolve script text ---
    if (!scriptText) {
      const { data: skit } = await supabaseAdmin
        .from("saved_skits")
        .select("skit_data")
        .eq("product_id", productId)
        .filter("generation_config->>content_type", "eq", "ugc_short")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!skit?.skit_data) {
        return createApiErrorResponse(
          "NOT_FOUND",
          "No scriptText provided and no UGC_SHORT skit found for this product",
          404,
          correlationId
        );
      }

      const skitData = skit.skit_data as {
        hook_line?: string;
        beats?: Array<{ dialogue?: string; action?: string }>;
        cta_line?: string;
      };

      // Build spoken text from skit data
      const lines: string[] = [];
      if (skitData.hook_line) lines.push(skitData.hook_line);
      if (skitData.beats) {
        for (const beat of skitData.beats) {
          if (beat.dialogue) lines.push(beat.dialogue);
        }
      }
      if (skitData.cta_line) lines.push(skitData.cta_line);

      scriptText = lines.join(" ");

      if (!scriptText.trim()) {
        return createApiErrorResponse(
          "BAD_REQUEST",
          "Skit found but contains no spoken dialogue",
          400,
          correlationId
        );
      }
    }

    // --- Step 2: Generate TTS audio via ElevenLabs ---
    console.log(
      `[${correlationId}] Generating TTS (${scriptText.length} chars)`
    );
    const audioBuffer = await textToSpeech(scriptText, voiceId);

    // --- Step 3: Save audio to Supabase storage + local temp file ---
    const audioStoragePath = `animated/${videoId}/${Date.now()}_voice.mp3`;
    const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
    const audioUpload = await uploadToStorage(
      "renders",
      audioStoragePath,
      audioBlob,
      { contentType: "audio/mpeg" }
    );

    // Browser service needs a local file path, so write to /tmp as well
    const tmpDir = `/tmp/flashflow-animated`;
    await mkdir(tmpDir, { recursive: true });
    const localAudioPath = path.join(tmpDir, `${videoId}.mp3`);
    await writeFile(localAudioPath, Buffer.from(audioBuffer));

    console.log(
      `[${correlationId}] Audio uploaded: ${audioUpload.url} (${audioBuffer.byteLength} bytes), local: ${localAudioPath}`
    );

    // --- Step 4: Call browser service to create animated video ---
    console.log(`[${correlationId}] Calling browser service for animated video`);
    const browserRes = await fetch(
      `${BROWSER_SERVICE_URL}/adobe/create-animated-video`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-service-key": BROWSER_SERVICE_KEY,
        },
        body: JSON.stringify({ audioPath: localAudioPath }),
      }
    );

    if (!browserRes.ok) {
      const errorText = await browserRes.text();
      throw new Error(
        `Browser service returned ${browserRes.status}: ${errorText}`
      );
    }

    const browserResult = (await browserRes.json()) as {
      ok: boolean;
      outputPath?: string;
      size?: number;
    };
    const renderedVideoPath = browserResult.outputPath;

    if (!renderedVideoPath) {
      throw new Error("Browser service returned no outputPath");
    }

    // --- Step 5: Upload finished video to Supabase storage ---
    // Read the local file that the browser service wrote
    console.log(
      `[${correlationId}] Uploading finished video from: ${renderedVideoPath}`
    );
    const videoFileBuffer = await readFile(renderedVideoPath);

    const videoBlob = new Blob([videoFileBuffer], { type: "video/mp4" });
    const videoStoragePath = `animated/${videoId}/${Date.now()}_final.mp4`;
    const videoUpload = await uploadToStorage(
      "renders",
      videoStoragePath,
      videoBlob,
      { contentType: "video/mp4" }
    );

    console.log(
      `[${correlationId}] Video uploaded: ${videoUpload.url} (${videoFileBuffer.byteLength} bytes)`
    );

    // Clean up temp files (non-blocking)
    unlink(localAudioPath).catch(() => {});
    unlink(renderedVideoPath).catch(() => {});

    // --- Step 6: Update video record ---
    await supabaseAdmin
      .from("videos")
      .update({
        render_url: videoUpload.url,
        final_video_url: videoUpload.url,
        recording_status: "READY_FOR_REVIEW",
      })
      .eq("id", videoId);

    await logVideoActivity(
      supabaseAdmin,
      videoId,
      "recording_status_changed",
      "AI_RENDERING",
      "READY_FOR_REVIEW",
      "system",
      `Animated video render complete (${Math.round(videoFileBuffer.byteLength / 1024)}KB)`,
      correlationId
    );

    // --- Step 7: Telegram notification ---
    await sendTelegramNotification(
      `🎬 <b>Animated video ready for review</b>\n` +
        `Product: ${product.brand} — ${product.name}\n` +
        `Video ID: <code>${videoId}</code>\n` +
        `Size: ${Math.round(videoFileBuffer.byteLength / 1024)}KB`
    );

    const response = NextResponse.json(
      {
        ok: true,
        videoId,
        renderUrl: videoUpload.url,
        audioUrl: audioUpload.url,
        recording_status: "READY_FOR_REVIEW",
        correlation_id: correlationId,
      },
      { status: 201 }
    );
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (err) {
    console.error(`[${correlationId}] Animated render error:`, err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Animated render failed",
      500,
      correlationId
    );
  }
}
