import { NextResponse } from "next/server";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTelegramNotification } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

const QUALITY_THRESHOLD = 6;

const HEYGEN_VISION_PROMPT = `You are a TikTok ad creative director reviewing an AI-generated talking-head avatar video frame. Be brutally honest.

Score each criterion from 1-10:

1. **avatar_natural** — Does the avatar look like a real person? Check for uncanny valley, frozen expression, robotic features, or obvious AI artifacts. Natural skin texture, realistic eyes, believable expressions = 8-10. Slightly off but acceptable = 5-7. Clearly fake/robotic = 1-4.
2. **framing** — Is the avatar well-framed for a vertical 9:16 TikTok video? Good headroom, centered or rule-of-thirds, not cut off awkwardly. Professional framing = 8-10. Acceptable = 5-7. Poor framing (head cut off, too far, off-center) = 1-4.
3. **speech_gestures** — Does the avatar appear to be naturally speaking? Look for lip sync quality, natural mouth movement, subtle head movement, appropriate facial expressions. Convincing = 8-10. Okay but stiff = 5-7. Frozen/puppet-like = 1-4.
4. **background_quality** — Is the background clean, professional, and appropriate for a product review? Clean/professional = 8-10. Plain but acceptable = 5-7. Distracting, ugly, or glitchy = 1-4.

Return ONLY valid JSON, no markdown:
{"avatar_natural":N,"framing":N,"speech_gestures":N,"background_quality":N,"avg":N.N,"summary":"One sentence explanation"}

The "avg" field must be the arithmetic mean of the 4 scores, rounded to 1 decimal.`;

export interface HeyGenQualityScore {
  avatar_natural: number;
  framing: number;
  speech_gestures: number;
  background_quality: number;
  avg: number;
  summary: string;
  frames_analyzed: number;
  scored_by: string;
  scored_at: string;
  pass: boolean;
}

/**
 * Run HeyGen-specific quality check. Exported for cron use.
 */
export async function runHeyGenQualityCheck(
  videoId: string,
  videoUrl: string
): Promise<HeyGenQualityScore | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const frames = await captureFrames(videoUrl, [1, 4, 8]);
  if (!frames.length) throw new Error("No frames captured from HeyGen video");

  const frameScores: Array<{
    avatar_natural: number;
    framing: number;
    speech_gestures: number;
    background_quality: number;
    avg: number;
    summary: string;
  }> = [];

  for (const frame of frames) {
    const score = await scoreFrame(apiKey, frame);
    if (score) frameScores.push(score);
  }

  if (!frameScores.length) {
    throw new Error(`Vision API failed on all ${frames.length} frames`);
  }

  const avg = (field: string) => {
    const vals = frameScores.map((s) => (s as Record<string, unknown>)[field] as number);
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  };

  return {
    avatar_natural: avg("avatar_natural"),
    framing: avg("framing"),
    speech_gestures: avg("speech_gestures"),
    background_quality: avg("background_quality"),
    avg: avg("avg"),
    summary: frameScores.map((s) => s.summary).join(" | "),
    frames_analyzed: frameScores.length,
    scored_by: "claude-sonnet-4-5",
    scored_at: new Date().toISOString(),
    pass: avg("avg") >= QUALITY_THRESHOLD,
  };
}

async function scoreFrame(
  apiKey: string,
  frameBase64: string
): Promise<{
  avatar_natural: number;
  framing: number;
  speech_gestures: number;
  background_quality: number;
  avg: number;
  summary: string;
} | null> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: frameBase64,
                },
              },
              { type: "text", text: HEYGEN_VISION_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`[heygen-qc] Vision API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text || "";
    let jsonStr = text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error("[heygen-qc] Frame scoring error:", err);
    return null;
  }
}

/**
 * Capture frames via Shotstack poster renders (serverless-compatible).
 */
async function captureFrames(
  videoUrl: string,
  timestamps: number[] = [1, 4, 8]
): Promise<string[]> {
  const { shotstackRequest, getRenderStatus: getSsStatus } = await import("@/lib/shotstack");
  const frames: string[] = [];
  const renderIds: string[] = [];

  for (const ts of timestamps) {
    try {
      const result = await shotstackRequest("/render", {
        method: "POST",
        body: JSON.stringify({
          timeline: {
            tracks: [
              {
                clips: [
                  {
                    asset: { type: "video", src: videoUrl, trim: ts },
                    start: 0,
                    length: 1,
                  },
                ],
              },
            ],
          },
          output: { format: "jpg", resolution: "sd", aspectRatio: "9:16" },
        }),
      });
      const renderId = result?.response?.id;
      if (renderId) renderIds.push(renderId);
    } catch (err) {
      console.warn(`[heygen-qc] Poster render failed for t=${ts}:`, err);
    }
  }

  if (!renderIds.length) return frames;

  const deadline = Date.now() + 30000;
  const pending = new Set(renderIds);
  const urls = new Map<string, string>();

  while (pending.size > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    for (const rid of Array.from(pending)) {
      try {
        const status = await getSsStatus(rid);
        const renderStatus = status?.response?.status || status?.status;
        if (renderStatus === "done") {
          const url = status?.response?.url || status?.url;
          if (url) urls.set(rid, url);
          pending.delete(rid);
        } else if (renderStatus === "failed") {
          pending.delete(rid);
        }
      } catch {
        // keep polling
      }
    }
  }

  for (const [, url] of urls) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.length > 500) frames.push(buf.toString("base64"));
      }
    } catch {
      // skip
    }
  }

  return frames;
}

/**
 * POST /api/render/heygen/[videoId]/quality-check
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const auth = await validateApiAccess(request);
  if (!auth) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const { videoId } = await params;

  if (!videoId || !/^[0-9a-f-]{36}$/.test(videoId)) {
    return createApiErrorResponse("BAD_REQUEST", "Invalid videoId", 400, correlationId);
  }

  const { data: video, error: videoErr } = await supabaseAdmin
    .from("videos")
    .select("id, runway_video_url, final_video_url, recording_status, render_provider, product_id")
    .eq("id", videoId)
    .single();

  if (videoErr || !video) {
    return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
  }

  // Use runway_video_url (the re-hosted HeyGen video) or final_video_url
  const videoUrl = video.runway_video_url || video.final_video_url;
  if (!videoUrl) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Video has no rendered URL — HeyGen render not yet complete",
      400,
      correlationId
    );
  }

  let score: HeyGenQualityScore;
  try {
    const result = await runHeyGenQualityCheck(videoId, videoUrl);
    if (!result) {
      return createApiErrorResponse("INTERNAL", "Quality check returned null", 500, correlationId);
    }
    score = result;
  } catch (err) {
    return createApiErrorResponse(
      "INTERNAL",
      `Quality check failed: ${err instanceof Error ? err.message : String(err)}`,
      500,
      correlationId
    );
  }

  // Update video record
  const updateData: Record<string, unknown> = { quality_score: score };

  if (video.recording_status === "READY_FOR_REVIEW" || video.recording_status === "AI_RENDERING") {
    if (!score.pass) {
      updateData.recording_status = "REJECTED";
      updateData.recording_notes = `HeyGen quality check: avg ${score.avg}/10 — REJECTED (threshold: ${QUALITY_THRESHOLD})`;
    }
  }

  await supabaseAdmin.from("videos").update(updateData).eq("id", videoId);

  // Product label for notifications
  let productLabel = videoId.slice(0, 8);
  if (video.product_id) {
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("name, brand")
      .eq("id", video.product_id)
      .single();
    if (product?.name) {
      productLabel = product.brand ? `${product.brand} — ${product.name}` : product.name;
    }
  }

  sendTelegramNotification(
    `🎬 HeyGen Quality: ${productLabel} scored ${score.avg}/10 — ${score.pass ? "PASS" : "REJECTED"}\n  Avatar: ${score.avatar_natural}, Framing: ${score.framing}, Speech: ${score.speech_gestures}, BG: ${score.background_quality}`
  );

  return NextResponse.json({
    ok: true,
    videoId,
    quality_score: score,
    decision: score.pass ? "pass" : "rejected",
    threshold: QUALITY_THRESHOLD,
    correlation_id: correlationId,
  });
}
