/**
 * Shared render-poll logic — extracted from /api/cron/check-renders so it can
 * also be called from the user-driven worker tick. Polls Runway + HeyGen
 * render statuses and advances the `videos`-table pipeline.
 *
 * NOTE: this handles the legacy `videos` table (skits/render pipeline). The
 * newer `ve_runs` queue is handled by tickActiveRuns().
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTaskStatus } from "@/lib/runway";
import { getVideoStatus as getHeyGenStatus } from "@/lib/heygen";
import { getRenderStatus } from "@/lib/shotstack";
import { textToSpeech, formatForTTS } from "@/lib/elevenlabs";
import { submitCompose, SfxClip } from "@/lib/compose";
import { buildDefaultSfxPlan } from "@/lib/ambient-audio";
import { runQualityCheck } from "@/app/api/render/quality-check/route";
import { sendTelegramLog } from "@/lib/telegram";
import { AI_BROLL_AVAILABLE } from "@/lib/marketplace/broll-providers";
import { estimateHeyGenCost } from "@/lib/finops/heygen-cost";
import { logToolUsageEventAsync } from "@/lib/finops/log-tool-usage";

async function getSfxClipsForVideo(videoId: string, duration: number): Promise<SfxClip[] | undefined> {
  try {
    const { data: video } = await supabaseAdmin
      .from("videos")
      .select("client_user_id")
      .eq("id", videoId)
      .single();
    if (!video?.client_user_id) return undefined;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("settings")
      .eq("id", video.client_user_id)
      .single();
    const settings = profile?.settings as Record<string, unknown> | null;
    const defaults = settings?.defaults as Record<string, unknown> | undefined;
    if (!defaults?.ambient_sfx_enabled) return undefined;
    const plan = await buildDefaultSfxPlan(duration);
    return plan.map(({ url, start, length, volume }) => ({ url, start, length, volume }));
  } catch (err) {
    console.warn(`[render-checks] SFX lookup failed for ${videoId}:`, err);
    return undefined;
  }
}

async function rehostVideo(sourceUrl: string, videoId: string, provider: string = "runway"): Promise<string> {
  const resp = await fetch(sourceUrl);
  if (!resp.ok) throw new Error(`Failed to download ${provider} video: ${resp.status}`);
  const buffer = await resp.arrayBuffer();
  const blob = new Blob([buffer], { type: "video/mp4" });
  const path = `${provider}/${videoId}_${Date.now()}.mp4`;
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
  if (!skit?.skit_data) return { onScreenText: undefined, cta: undefined, ttsText: undefined };
  const skitData = skit.skit_data as {
    beats?: Array<{ on_screen_text?: string; dialogue?: string }>;
    cta_overlay?: string;
    hook_line?: string;
    cta_line?: string;
  };
  const textSegments = (skitData.beats || []).map((b) => b.on_screen_text).filter(Boolean) as string[];
  const onScreenText = textSegments.length ? textSegments.join("|") : undefined;
  const cta = skitData.cta_overlay || undefined;
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
      if (product?.name) return product.brand ? `${product.brand} — ${product.name}` : product.name;
    }
  } catch {
    /* fall through */
  }
  return videoId.slice(0, 8);
}

async function generateAndUploadTTS(text: string, videoId: string): Promise<string> {
  const audioBuffer = await textToSpeech(formatForTTS(text));
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  const path = `tts/${videoId}_${Date.now()}.mp3`;
  const { error } = await supabaseAdmin.storage
    .from("renders")
    .upload(path, blob, { contentType: "audio/mpeg", upsert: false });
  if (error) throw new Error(`TTS upload failed: ${error.message}`);
  const { data } = supabaseAdmin.storage.from("renders").getPublicUrl(path);
  return data.publicUrl;
}

// ---- Public: run all three render-check phases ----

export async function runRenderChecks(maxPerPhase: number = 20): Promise<{
  checked: number;
  results: Record<string, unknown>[];
}> {
  const results: Record<string, unknown>[] = [];
  await checkComposeRenders(results, maxPerPhase);
  await checkRunwayRenders(results, maxPerPhase);
  await checkHeyGenRenders(results, maxPerPhase);
  return { checked: results.length, results };
}

async function checkComposeRenders(results: Record<string, unknown>[], max: number) {
  const { data: composing } = await supabaseAdmin
    .from("videos")
    .select("id, compose_render_id")
    .eq("recording_status", "AI_RENDERING")
    .not("compose_render_id", "is", null)
    .is("final_video_url", null)
    .limit(max);

  if (!composing?.length) return;

  for (const video of composing) {
    try {
      const status = await getRenderStatus(video.compose_render_id);
      const renderStatus = status.response?.status || status.status;

      if (renderStatus === "done") {
        const finalUrl = status.response?.url || status.url;
        await supabaseAdmin.from("videos").update({ final_video_url: finalUrl }).eq("id", video.id);

        let qualityScore: Awaited<ReturnType<typeof runQualityCheck>> = null;
        try {
          qualityScore = await runQualityCheck(video.id, finalUrl, video.compose_render_id);
        } catch (qcErr) {
          console.warn(`[render-checks] Quality check failed for ${video.id}, passing through:`, qcErr);
        }
        const productLabel = await getVideoProductLabel(video.id);

        if (qualityScore && !qualityScore.pass) {
          await supabaseAdmin
            .from("videos")
            .update({
              recording_status: "REJECTED",
              quality_score: qualityScore,
              recording_notes: `Auto-rejected by quality check: avg ${qualityScore.avg}/10`,
            })
            .eq("id", video.id);
          sendTelegramLog(
            `🎬 Quality Gate: ${productLabel} scored ${qualityScore.avg}/10 — REJECTED`
          );
          results.push({ id: video.id, phase: "compose", status: "auto_rejected", quality: qualityScore.avg, finalUrl });
        } else {
          const warnings = AI_BROLL_AVAILABLE ? [] : ["SKIPPED_BROLL"];
          await supabaseAdmin
            .from("videos")
            .update({
              recording_status: "READY_FOR_REVIEW",
              ...(qualityScore ? { quality_score: qualityScore } : {}),
              ...(warnings.length ? { pipeline_warnings: warnings } : {}),
            })
            .eq("id", video.id);
          sendTelegramLog(
            qualityScore
              ? `🎬 Quality Gate: ${productLabel} scored ${qualityScore.avg}/10 — PASS`
              : `🎬 Video ready: ${productLabel}`
          );
          results.push({ id: video.id, phase: "compose", status: "done", quality: qualityScore?.avg ?? null, warnings, finalUrl });
        }
      } else if (renderStatus === "failed") {
        const composeError = status.response?.error || "unknown";
        await supabaseAdmin
          .from("videos")
          .update({ recording_status: "REJECTED", recording_notes: `Shotstack compose failed: ${composeError}` })
          .eq("id", video.id);
        const productLabel = await getVideoProductLabel(video.id);
        sendTelegramLog(`❌ Render failed: ${productLabel} — ${composeError}`);
        results.push({ id: video.id, phase: "compose", status: "failed" });
      } else {
        results.push({ id: video.id, phase: "compose", status: renderStatus });
      }
    } catch (err) {
      console.error(`[render-checks] Compose poll error for ${video.id}:`, err);
      results.push({ id: video.id, phase: "compose", status: "error", error: String(err) });
    }
  }
}

async function checkRunwayRenders(results: Record<string, unknown>[], max: number) {
  const { data: rendering } = await supabaseAdmin
    .from("videos")
    .select("id, render_task_id, render_provider, product_id")
    .eq("recording_status", "AI_RENDERING")
    .not("render_task_id", "is", null)
    .is("compose_render_id", null)
    .limit(max);

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
        const rehostedUrl = await rehostVideo(runwayVideoUrl, video.id);
        const { onScreenText, cta, ttsText } = await getSkitOverlays(video.id);
        let audioUrl: string | undefined;
        if (ttsText) {
          try {
            audioUrl = await generateAndUploadTTS(ttsText, video.id);
          } catch (ttsErr) {
            console.warn(`[render-checks] TTS failed for ${video.id}:`, ttsErr);
          }
        }
        let productImageUrl: string | undefined;
        if (video.product_id) {
          const { data: product } = await supabaseAdmin
            .from("products")
            .select("product_image_url")
            .eq("id", video.product_id)
            .single();
          productImageUrl = product?.product_image_url || undefined;
        }
        const sfxClips = await getSfxClipsForVideo(video.id, 10);
        const compose = await submitCompose({
          videoUrl: rehostedUrl,
          audioUrl,
          onScreenText,
          cta,
          duration: 10,
          productImageUrl,
          sfxClips,
        });
        await supabaseAdmin
          .from("videos")
          .update({ compose_render_id: compose.renderId, runway_video_url: rehostedUrl })
          .eq("id", video.id);
        results.push({ id: video.id, phase: "runway", status: "composing", composeRenderId: compose.renderId });
      } else if (task.status === "FAILED") {
        const reason = task.failure || "unknown";
        await supabaseAdmin
          .from("videos")
          .update({ recording_status: "REJECTED", recording_notes: `Runway render failed: ${reason}` })
          .eq("id", video.id);
        const productLabel = await getVideoProductLabel(video.id);
        sendTelegramLog(`❌ Render failed: ${productLabel} — ${reason}`);
        results.push({ id: video.id, phase: "runway", status: "failed", reason });
      } else {
        results.push({ id: video.id, phase: "runway", status: task.status, progress: task.progress });
      }
    } catch (err) {
      console.error(`[render-checks] Runway poll error for ${video.id}:`, err);
      results.push({ id: video.id, phase: "runway", status: "error", error: String(err) });
    }
  }
}

async function checkHeyGenRenders(results: Record<string, unknown>[], max: number) {
  const { data: rendering } = await supabaseAdmin
    .from("videos")
    .select("id, render_task_id, render_provider")
    .eq("recording_status", "AI_RENDERING")
    .eq("render_provider", "heygen")
    .not("render_task_id", "is", null)
    .is("compose_render_id", null)
    .is("runway_video_url", null)
    .limit(max);

  if (!rendering?.length) return;

  for (const video of rendering) {
    try {
      const status = await getHeyGenStatus(video.render_task_id);
      if (status.status === "completed" && status.video_url) {
        if (status.duration && status.duration > 0) {
          const { data: existing } = await supabaseAdmin
            .from("tool_usage_events")
            .select("id")
            .eq("tool_name", "heygen")
            .eq("run_id", video.render_task_id)
            .limit(1);
          if (!existing?.length) {
            const cost = estimateHeyGenCost({ durationSeconds: status.duration });
            logToolUsageEventAsync({
              tool_name: "heygen",
              lane: "video-pipeline",
              run_id: video.render_task_id,
              duration_ms: status.duration * 1000,
              success: true,
              cost_usd: cost.estimated_usd,
              metadata: {
                video_id: video.id,
                heygen_video_id: video.render_task_id,
                engine: cost.engine,
                duration_seconds: cost.duration_seconds,
                credits_used: cost.credits_used,
                rate_credits_per_min: cost.rate_credits_per_min,
                usd_per_credit: cost.usd_per_credit,
              },
            });
          }
        }
        const rehostedUrl = await rehostVideo(status.video_url, video.id, "heygen");
        const { onScreenText, cta } = await getSkitOverlays(video.id);
        const hasOverlays = !!(onScreenText || cta);
        if (hasOverlays) {
          const heygenDuration = status.duration ?? 15;
          const sfxClips = await getSfxClipsForVideo(video.id, heygenDuration);
          const compose = await submitCompose({
            videoUrl: rehostedUrl,
            onScreenText,
            cta,
            duration: heygenDuration,
            sfxClips,
          });
          await supabaseAdmin
            .from("videos")
            .update({ compose_render_id: compose.renderId, runway_video_url: rehostedUrl })
            .eq("id", video.id);
          results.push({ id: video.id, phase: "heygen", status: "composing", composeRenderId: compose.renderId });
        } else {
          const heygenWarnings = AI_BROLL_AVAILABLE ? [] : ["SKIPPED_BROLL"];
          await supabaseAdmin
            .from("videos")
            .update({
              runway_video_url: rehostedUrl,
              final_video_url: rehostedUrl,
              recording_status: "READY_FOR_REVIEW",
              ...(heygenWarnings.length ? { pipeline_warnings: heygenWarnings } : {}),
            })
            .eq("id", video.id);
          const productLabel = await getVideoProductLabel(video.id);
          sendTelegramLog(
            `🎬 <b>HeyGen video ready for review</b>\nProduct: ${productLabel}\nVideo: <code>${video.id}</code>`
          );
          results.push({ id: video.id, phase: "heygen", status: "done", warnings: heygenWarnings, finalUrl: rehostedUrl });
        }
      } else if (status.status === "failed" || status.status === "error") {
        await supabaseAdmin
          .from("videos")
          .update({ recording_status: "REJECTED", recording_notes: `HeyGen render failed: ${status.status}` })
          .eq("id", video.id);
        const productLabel = await getVideoProductLabel(video.id);
        sendTelegramLog(`❌ HeyGen render failed: ${productLabel}`);
        results.push({ id: video.id, phase: "heygen", status: "failed" });
      } else {
        results.push({ id: video.id, phase: "heygen", status: status.status });
      }
    } catch (err) {
      console.error(`[render-checks] HeyGen poll error for ${video.id}:`, err);
      results.push({ id: video.id, phase: "heygen", status: "error", error: String(err) });
    }
  }
}
