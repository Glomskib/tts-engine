import { NextResponse } from "next/server";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { textToSpeech } from "@/lib/elevenlabs";
import { uploadAudio, generateVideo, getPersona } from "@/lib/heygen";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logVideoActivity } from "@/lib/videoActivity";
import { sendTelegramNotification } from "@/lib/telegram";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const HeyGenSchema = z.object({
  videoId: z.string().uuid(),
  avatarId: z.string().optional(),
  voiceId: z.string().optional(),
  personaId: z.string().optional(),
});

/**
 * POST /api/render/heygen
 *
 * Kick off a talking-head avatar video via HeyGen (async):
 * 1. Fetch video record + linked skit
 * 2. Build dialogue text from skit (hook_line + beat dialogues + cta_line)
 * 3. Generate TTS via ElevenLabs
 * 4. Upload audio to HeyGen
 * 5. Submit avatar video generation
 * 6. Save HeyGen video_id as render_task_id → return immediately
 *
 * The check-renders cron polls HeyGen, re-hosts the video,
 * and handles compose/finalization.
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

  const { videoId, avatarId, voiceId, personaId } = parsed.data;
  const persona = getPersona(personaId);

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

    // --- Step 1: Generate TTS via ElevenLabs (persona voice settings) ---
    const resolvedVoiceId = voiceId || persona.voiceId;
    const audioBuffer = await textToSpeech(ttsText, resolvedVoiceId, {
      stability: persona.voiceStability,
      similarityBoost: persona.voiceSimilarityBoost,
    });
    console.log(`[${correlationId}] TTS generated: ${audioBuffer.byteLength} bytes (persona: ${persona.id})`);

    // --- Step 2: Upload audio to HeyGen ---
    const { url: audioUrl } = await uploadAudio(audioBuffer);
    console.log(`[${correlationId}] Audio uploaded to HeyGen: ${audioUrl}`);

    // --- Step 3: Submit avatar video generation (async — returns immediately) ---
    const { video_id: heygenVideoId } = await generateVideo(audioUrl, avatarId, undefined, personaId);
    console.log(`[${correlationId}] HeyGen video queued: ${heygenVideoId} (persona: ${persona.id})`);

    // Save task ID — check-renders cron will poll from here
    await supabaseAdmin
      .from("videos")
      .update({ render_task_id: heygenVideoId })
      .eq("id", videoId);

    await logVideoActivity(
      supabaseAdmin,
      videoId,
      "recording_status_changed",
      video.recording_status,
      "AI_RENDERING",
      "system",
      `HeyGen avatar render queued (task: ${heygenVideoId})`,
      correlationId
    );

    const productLabel = await getVideoProductLabel(videoId);
    sendTelegramNotification(
      `🎬 <b>HeyGen render queued</b>\nProduct: ${productLabel}\nVideo: <code>${videoId}</code>\nPersona: ${persona.label}\nAvatar: ${avatarId || persona.avatarId}\nHeyGen task: <code>${heygenVideoId}</code>`
    );

    const response = NextResponse.json(
      {
        ok: true,
        videoId,
        provider: "heygen",
        heygenVideoId,
        status: "queued",
        correlation_id: correlationId,
      },
      { status: 201 }
    );
    response.headers.set("x-correlation-id", correlationId);
    return response;
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
