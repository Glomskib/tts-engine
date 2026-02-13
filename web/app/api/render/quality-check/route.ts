import { NextResponse } from "next/server";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

const QUALITY_THRESHOLD = 6; // out of 10 average — below this = auto-reject

const VISION_PROMPT = `You are a TikTok ad creative director reviewing an AI-generated product video frame. Be brutally honest.

Score each criterion from 1-10:

1. **product_visible** — Is a real product clearly visible and identifiable? A close-up of just liquid, a vague shape, or a missing product = 1-3. Product bottle/package clearly shown = 7-10.
2. **label_legible** — Can you read the product name and brand on the label? Garbled/AI-hallucinated text = 1-3. Partially readable = 4-6. Crisp and fully legible = 7-10.
3. **natural_look** — Does this look like a real smartphone video, or obviously AI-generated? Uncanny valley, warped geometry, impossible anatomy = 1-3. Mostly natural = 5-7. Could pass for real = 8-10.
4. **lighting_quality** — Is the lighting professional and flattering? Dark, flat, or harsh = 1-3. Decent = 5-7. Soft, natural, professional = 8-10.

Return ONLY valid JSON, no markdown:
{"product_visible":N,"label_legible":N,"natural_look":N,"lighting_quality":N,"avg":N.N,"summary":"One sentence explanation"}

The "avg" field must be the arithmetic mean of the 4 scores, rounded to 1 decimal.`;

export interface QualityScore {
  product_visible: number;
  label_legible: number;
  natural_look: number;
  lighting_quality: number;
  avg: number;
  summary: string;
  frames_analyzed: number;
  scored_by: string;
  scored_at: string;
  pass: boolean;
}

/**
 * Run quality check on a video. Exported so check-renders cron can call it directly.
 */
export async function runQualityCheck(
  videoId: string,
  finalVideoUrl: string
): Promise<QualityScore | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[quality-check] ANTHROPIC_API_KEY not configured");
    return null;
  }

  // Download the video
  const videoResp = await fetch(finalVideoUrl);
  if (!videoResp.ok) {
    console.error(`[quality-check] Failed to download video: ${videoResp.status}`);
    return null;
  }

  const videoBuffer = Buffer.from(await videoResp.arrayBuffer());

  // Extract frames using ffmpeg via child_process
  // We grab 3 frames: 1s, 4s, 8s — to check start, middle, end
  const frames = await extractFrames(videoBuffer);
  if (!frames.length) {
    console.error("[quality-check] No frames extracted");
    return null;
  }

  // Score each frame with Claude Vision, then average
  const frameScores: Array<{
    product_visible: number;
    label_legible: number;
    natural_look: number;
    lighting_quality: number;
    avg: number;
    summary: string;
  }> = [];

  for (const frame of frames) {
    const score = await scoreFrame(apiKey, frame);
    if (score) frameScores.push(score);
  }

  if (!frameScores.length) {
    console.error("[quality-check] No frames scored successfully");
    return null;
  }

  // Average across all scored frames
  const avg = (field: keyof (typeof frameScores)[0]) => {
    if (field === "summary") return "";
    const vals = frameScores.map((s) => s[field] as number);
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  };

  const result: QualityScore = {
    product_visible: avg("product_visible") as number,
    label_legible: avg("label_legible") as number,
    natural_look: avg("natural_look") as number,
    lighting_quality: avg("lighting_quality") as number,
    avg: avg("avg") as number,
    summary: frameScores.map((s) => s.summary).join(" | "),
    frames_analyzed: frameScores.length,
    scored_by: "claude-sonnet-4-5",
    scored_at: new Date().toISOString(),
    pass: (avg("avg") as number) >= QUALITY_THRESHOLD,
  };

  return result;
}

async function scoreFrame(
  apiKey: string,
  frameBase64: string
): Promise<{
  product_visible: number;
  label_legible: number;
  natural_look: number;
  lighting_quality: number;
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
              {
                type: "text",
                text: VISION_PROMPT,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`[quality-check] Vision API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text || "";

    // Parse JSON — handle potential markdown wrapping
    let jsonStr = text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    return JSON.parse(jsonStr);
  } catch (err) {
    console.error("[quality-check] Frame scoring error:", err);
    return null;
  }
}

async function extractFrames(videoBuffer: Buffer): Promise<string[]> {
  // Use child_process to call ffmpeg — write video to tmp, extract frames
  const { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } =
    await import("fs");
  const { execSync } = await import("child_process");
  const { join } = await import("path");
  const { tmpdir } = await import("os");

  const workDir = join(tmpdir(), `qc_${Date.now()}`);
  mkdirSync(workDir, { recursive: true });

  const videoPath = join(workDir, "input.mp4");
  writeFileSync(videoPath, videoBuffer);

  const frames: string[] = [];
  const timestamps = [1, 4, 8]; // seconds

  try {
    for (const ts of timestamps) {
      const framePath = join(workDir, `frame_${ts}.jpg`);
      try {
        execSync(
          `ffmpeg -y -i "${videoPath}" -ss ${ts} -frames:v 1 -q:v 2 "${framePath}" 2>/dev/null`,
          { timeout: 10000 }
        );
        if (existsSync(framePath)) {
          const frameData = readFileSync(framePath);
          frames.push(frameData.toString("base64"));
          unlinkSync(framePath);
        }
      } catch {
        // Frame at this timestamp may not exist (short video)
      }
    }
  } finally {
    // Cleanup
    try {
      unlinkSync(videoPath);
      const { rmdirSync } = await import("fs");
      rmdirSync(workDir);
    } catch {
      // best effort cleanup
    }
  }

  return frames;
}

/**
 * POST /api/render/quality-check
 *
 * Run AI quality assessment on a rendered video.
 * If score >= threshold: READY_FOR_REVIEW
 * If score < threshold: auto-REJECTED
 */
export async function POST(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const auth = await validateApiAccess(request);
  if (!auth) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId
    );
  }

  let body: { videoId: string };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Invalid JSON",
      400,
      correlationId
    );
  }

  if (!body.videoId || typeof body.videoId !== "string") {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "videoId required",
      400,
      correlationId
    );
  }

  const { data: video, error: videoErr } = await supabaseAdmin
    .from("videos")
    .select("id, final_video_url, recording_status, product_id")
    .eq("id", body.videoId)
    .single();

  if (videoErr || !video) {
    return createApiErrorResponse(
      "NOT_FOUND",
      "Video not found",
      404,
      correlationId
    );
  }

  if (!video.final_video_url) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Video has no final_video_url — render not complete",
      400,
      correlationId
    );
  }

  // Run quality check
  const score = await runQualityCheck(body.videoId, video.final_video_url);

  if (!score) {
    return createApiErrorResponse(
      "INTERNAL",
      "Quality check failed — could not score video",
      500,
      correlationId
    );
  }

  // Determine new status based on score
  const newStatus = score.pass ? "READY_FOR_REVIEW" : "REJECTED";
  const updateData: Record<string, unknown> = {
    quality_score: score,
  };

  // Only transition status if currently AI_RENDERING or READY_FOR_REVIEW
  if (
    video.recording_status === "AI_RENDERING" ||
    video.recording_status === "READY_FOR_REVIEW"
  ) {
    updateData.recording_status = newStatus;
    if (!score.pass) {
      updateData.recording_notes = `Auto-rejected by quality check: avg ${score.avg}/10 (threshold: ${QUALITY_THRESHOLD})`;
    }
  }

  await supabaseAdmin
    .from("videos")
    .update(updateData)
    .eq("id", body.videoId);

  // Get product name for the response
  let productName: string | null = null;
  if (video.product_id) {
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("name, brand")
      .eq("id", video.product_id)
      .single();
    if (product) {
      productName = product.brand
        ? `${product.brand} ${product.name}`
        : product.name;
    }
  }

  return NextResponse.json({
    ok: true,
    videoId: body.videoId,
    product: productName,
    quality_score: score,
    decision: newStatus,
    threshold: QUALITY_THRESHOLD,
    previous_status: video.recording_status,
    correlation_id: correlationId,
  });
}
