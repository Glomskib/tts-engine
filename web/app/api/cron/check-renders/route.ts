/**
 * Cron: Poll Runway render tasks and auto-compose completed videos.
 * Runs every 2 minutes via Vercel Cron.
 *
 * Flow:
 *   AI_RENDERING → poll Runway → SUCCEEDED → re-host video → generate TTS →
 *   submit Shotstack compose → update video with compose_render_id →
 *   (next cron tick checks Shotstack) → set final_video_url →
 *   quality check → READY_FOR_REVIEW or REJECTED
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTaskStatus } from "@/lib/runway";
import { getRenderStatus } from "@/lib/shotstack";
import { textToSpeech } from "@/lib/elevenlabs";
import { submitCompose } from "@/lib/compose";
import { runQualityCheck } from "@/app/api/render/quality-check/route";
import { sendTelegramNotification } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const results: Record<string, unknown>[] = [];

  // --- Phase 1: Check pending Shotstack compose renders ---
  await checkComposeRenders(results);

  // --- Phase 2: Check Runway renders and trigger compose ---
  await checkRunwayRenders(results);

  return NextResponse.json({
    ok: true,
    checked: results.length,
    results,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Phase 1: Videos that have a compose_render_id but no final_video_url.
 * Poll Shotstack and finalize when done.
 */
async function checkComposeRenders(results: Record<string, unknown>[]) {
  const { data: composing } = await supabaseAdmin
    .from("videos")
    .select("id, compose_render_id")
    .eq("recording_status", "AI_RENDERING")
    .not("compose_render_id", "is", null)
    .is("final_video_url", null)
    .limit(20);

  if (!composing?.length) return;

  for (const video of composing) {
    try {
      const status = await getRenderStatus(video.compose_render_id);
      const renderStatus = status.response?.status || status.status;

      if (renderStatus === "done") {
        const finalUrl = status.response?.url || status.url;

        // Save final URL first (quality check needs it)
        await supabaseAdmin
          .from("videos")
          .update({ final_video_url: finalUrl })
          .eq("id", video.id);

        // Run AI quality gate (null if check fails — pass through to review)
        let qualityScore: Awaited<ReturnType<typeof runQualityCheck>> = null;
        try {
          qualityScore = await runQualityCheck(video.id, finalUrl, video.compose_render_id);
        } catch (qcErr) {
          console.warn(`[check-renders] Quality check failed for ${video.id}, passing through:`, qcErr);
        }
        const productLabel = await getVideoProductLabel(video.id);

        if (qualityScore && !qualityScore.pass) {
          // Auto-reject: below quality threshold
          await supabaseAdmin
            .from("videos")
            .update({
              recording_status: "REJECTED",
              quality_score: qualityScore,
              recording_notes: `Auto-rejected by quality check: avg ${qualityScore.avg}/10`,
            })
            .eq("id", video.id);

          sendTelegramNotification(
            `🚫 Auto-rejected: ${productLabel} — quality ${qualityScore.avg}/10`
          );

          results.push({
            id: video.id,
            phase: "compose",
            status: "auto_rejected",
            quality: qualityScore.avg,
            finalUrl,
          });
        } else {
          // Quality passed (or check unavailable — pass through)
          await supabaseAdmin
            .from("videos")
            .update({
              recording_status: "READY_FOR_REVIEW",
              ...(qualityScore ? { quality_score: qualityScore } : {}),
            })
            .eq("id", video.id);

          sendTelegramNotification(
            `🎬 Video ready: ${productLabel}${qualityScore ? ` (quality: ${qualityScore.avg}/10)` : ""}`
          );

          results.push({
            id: video.id,
            phase: "compose",
            status: "done",
            quality: qualityScore?.avg ?? null,
            finalUrl,
          });
        }
      } else if (renderStatus === "failed") {
        const composeError = status.response?.error || "unknown";
        await supabaseAdmin
          .from("videos")
          .update({
            recording_status: "REJECTED",
            recording_notes: `Shotstack compose failed: ${composeError}`,
          })
          .eq("id", video.id);

        const productLabel = await getVideoProductLabel(video.id);
        sendTelegramNotification(`❌ Render failed: ${productLabel} — ${composeError}`);

        results.push({ id: video.id, phase: "compose", status: "failed" });
      } else {
        results.push({ id: video.id, phase: "compose", status: renderStatus });
      }
    } catch (err) {
      console.error(`[check-renders] Compose poll error for ${video.id}:`, err);
      results.push({ id: video.id, phase: "compose", status: "error", error: String(err) });
    }
  }
}

/**
 * Phase 2: Videos with a render_task_id (Runway) that haven't started composing yet.
 * Poll Runway, and when SUCCEEDED, re-host video + generate TTS + submit compose.
 */
async function checkRunwayRenders(results: Record<string, unknown>[]) {
  const { data: rendering } = await supabaseAdmin
    .from("videos")
    .select("id, render_task_id, render_provider")
    .eq("recording_status", "AI_RENDERING")
    .not("render_task_id", "is", null)
    .is("compose_render_id", null)
    .limit(20);

  if (!rendering?.length) return;

  for (const video of rendering) {
    if (video.render_provider !== "runway") {
      results.push({ id: video.id, phase: "runway", status: "skipped", reason: "not runway" });
      continue;
    }

    try {
      const task = await getTaskStatus(video.render_task_id);

      if (task.status === "SUCCEEDED" && task.output?.length) {
        const runwayVideoUrl = task.output[0];
        console.log(`[check-renders] Runway SUCCEEDED for ${video.id}: ${runwayVideoUrl}`);

        // Re-host Runway video to Supabase (Runway URLs expire)
        const rehostedUrl = await rehostVideo(runwayVideoUrl, video.id);

        // Fetch linked skit for text overlays and CTA
        const { onScreenText, cta, ttsText } = await getSkitOverlays(video.id);

        // Generate TTS audio
        let audioUrl: string | undefined;
        if (ttsText) {
          try {
            audioUrl = await generateAndUploadTTS(ttsText, video.id);
          } catch (ttsErr) {
            console.warn(`[check-renders] TTS failed for ${video.id}, composing without audio:`, ttsErr);
          }
        }

        // Submit Shotstack compose
        const compose = await submitCompose({
          videoUrl: rehostedUrl,
          audioUrl,
          onScreenText,
          cta,
          duration: 10,
        });

        // Store compose render ID on the video — Phase 1 will finalize it
        await supabaseAdmin
          .from("videos")
          .update({
            compose_render_id: compose.renderId,
            runway_video_url: rehostedUrl,
          })
          .eq("id", video.id);

        results.push({
          id: video.id,
          phase: "runway",
          status: "composing",
          composeRenderId: compose.renderId,
        });
      } else if (task.status === "FAILED") {
        const reason = task.failure || "unknown";
        console.error(`[check-renders] Runway FAILED for ${video.id}: ${reason}`);

        await supabaseAdmin
          .from("videos")
          .update({
            recording_status: "REJECTED",
            recording_notes: `Runway render failed: ${reason}`,
          })
          .eq("id", video.id);

        const productLabel = await getVideoProductLabel(video.id);
        sendTelegramNotification(`❌ Render failed: ${productLabel} — ${reason}`);

        results.push({ id: video.id, phase: "runway", status: "failed", reason });
      } else {
        // Still processing
        results.push({
          id: video.id,
          phase: "runway",
          status: task.status,
          progress: task.progress,
        });
      }
    } catch (err) {
      console.error(`[check-renders] Runway poll error for ${video.id}:`, err);
      results.push({ id: video.id, phase: "runway", status: "error", error: String(err) });
    }
  }
}

// --- Helpers ---

async function rehostVideo(sourceUrl: string, videoId: string): Promise<string> {
  const resp = await fetch(sourceUrl);
  if (!resp.ok) throw new Error(`Failed to download Runway video: ${resp.status}`);

  const buffer = await resp.arrayBuffer();
  const blob = new Blob([buffer], { type: "video/mp4" });
  const path = `runway/${videoId}_${Date.now()}.mp4`;

  const { error } = await supabaseAdmin.storage
    .from("renders")
    .upload(path, blob, { contentType: "video/mp4", upsert: true });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const { data } = supabaseAdmin.storage.from("renders").getPublicUrl(path);
  return data.publicUrl;
}

async function getSkitOverlays(videoId: string): Promise<{
  onScreenText: string | undefined;
  cta: string | undefined;
  ttsText: string | undefined;
}> {
  const { data: skit } = await supabaseAdmin
    .from("saved_skits")
    .select("skit_data")
    .eq("video_id", videoId)
    .single();

  if (!skit?.skit_data) {
    return { onScreenText: undefined, cta: undefined, ttsText: undefined };
  }

  const skitData = skit.skit_data as {
    beats?: Array<{ on_screen_text?: string; dialogue?: string }>;
    cta_overlay?: string;
    hook_line?: string;
    cta_line?: string;
  };

  // Build on-screen text from beats' on_screen_text fields
  const textSegments = (skitData.beats || [])
    .map((b) => b.on_screen_text)
    .filter(Boolean) as string[];
  const onScreenText = textSegments.length ? textSegments.join("|") : undefined;

  const cta = skitData.cta_overlay || undefined;

  // Build TTS text from hook + dialogue + CTA
  // Skip beat dialogue that duplicates or is contained in the hook_line
  const ttsLines: string[] = [];
  const hookLine = skitData.hook_line || "";
  if (hookLine) ttsLines.push(hookLine);
  for (const beat of skitData.beats || []) {
    if (beat.dialogue && !hookLine.includes(beat.dialogue) && !beat.dialogue.startsWith(hookLine)) {
      ttsLines.push(beat.dialogue);
    }
  }
  if (skitData.cta_line) ttsLines.push(skitData.cta_line);
  const ttsText = ttsLines.length ? ttsLines.join(" ") : undefined;

  return { onScreenText, cta, ttsText };
}

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

async function generateAndUploadTTS(text: string, videoId: string): Promise<string> {
  const audioBuffer = await textToSpeech(text);
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  const path = `tts/${videoId}_${Date.now()}.mp3`;

  const { error } = await supabaseAdmin.storage
    .from("renders")
    .upload(path, blob, { contentType: "audio/mpeg", upsert: false });

  if (error) throw new Error(`TTS upload failed: ${error.message}`);

  const { data } = supabaseAdmin.storage.from("renders").getPublicUrl(path);
  return data.publicUrl;
}
