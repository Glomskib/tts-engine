import { NextResponse } from "next/server";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { shotstackRequest } from "@/lib/shotstack";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const ComposeSchema = z.object({
  videoUrl: z.string().url(),
  audioUrl: z.string().url().optional(),
  onScreenText: z.string().max(500).optional(),
  cta: z.string().max(200).optional(),
  duration: z.number().min(1).max(120).optional(),
});

/**
 * Split on-screen text into timed cards.
 * - Splits on "|" delimiter first
 * - Any segment > 40 chars gets word-wrapped into max-20-char lines, max 2 lines per card
 * - Returns array of { text, start, length } clips evenly distributed before CTA
 */
function buildTextCards(
  raw: string,
  videoDuration: number,
  ctaDuration: number
): { text: string; start: number; length: number }[] {
  // Split on pipe delimiter and trim
  const segments = raw
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  // Available time for on-screen text (reserve last ctaDuration for CTA)
  const textWindow = Math.max(videoDuration - ctaDuration - 0.5, 2);
  const cardDuration = Math.min(textWindow / segments.length, 4);
  const gap = 0.3; // small gap between cards

  return segments.map((seg, i) => ({
    text: seg,
    start: 0.5 + i * (cardDuration + gap),
    length: cardDuration,
  }));
}

// Shotstack HTML assets use HTML4 / CSS 2.1 only.
// No rgba(), border-radius, flexbox, or overflow-wrap.
// Use the `css` property on the asset instead of inline styles.

const TEXT_CARD_CSS = `
p { font-family: Montserrat; font-weight: 700; font-size: 52px;
    color: #ffffff; text-align: center; line-height: 1.3;
    padding: 16px 32px; margin: 0; }
`.trim();

const CTA_CSS = `
p { font-family: Montserrat; font-weight: 700; font-size: 56px;
    color: #ffffff; text-align: center; line-height: 1.3;
    padding: 20px 40px; margin: 0; }
`.trim();

function textCardAsset(text: string) {
  return {
    type: "html" as const,
    html: `<p>${escapeHtml(text)}</p>`,
    css: TEXT_CARD_CSS,
    width: 800,
    height: 120,
    background: "#000000",
  };
}

function ctaAsset(text: string) {
  return {
    type: "html" as const,
    html: `<p>${escapeHtml(text)}</p>`,
    css: CTA_CSS,
    width: 800,
    height: 140,
    background: "#000000",
  };
}

export async function POST(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const auth = await validateApiAccess(request);
  if (!auth) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  const parsed = ComposeSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse("VALIDATION_ERROR", "Invalid input", 400, correlationId, {
      issues: parsed.error.issues,
    });
  }

  const { videoUrl, audioUrl, onScreenText, cta } = parsed.data;

  // Probe video URL if duration not provided — fall back to 10s default
  let duration = parsed.data.duration;
  if (!duration) {
    try {
      const headResp = await fetch(videoUrl, { method: "HEAD", redirect: "follow" });
      if (!headResp.ok) {
        return createApiErrorResponse(
          "BAD_REQUEST",
          `Video URL not accessible (HTTP ${headResp.status}). Provide a publicly accessible video URL.`,
          400,
          correlationId
        );
      }
    } catch {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "Video URL not accessible. Provide a publicly accessible video URL.",
        400,
        correlationId
      );
    }
    duration = 10;
  }

  const ctaLength = 3.5;

  // Build Shotstack timeline — video on bottom track, text overlays on top
  const tracks: Record<string, unknown>[] = [];

  // CTA — centered, last 3.5s of video
  if (cta) {
    tracks.push({
      clips: [
        {
          asset: ctaAsset(cta),
          start: Math.max(0, duration - ctaLength),
          length: Math.min(ctaLength, duration),
          position: "center",
          opacity: 0.85,
          transition: { in: "fade", out: "fade" },
        },
      ],
    });
  }

  // On-screen text — split into timed cards at lower-third (70% from top)
  if (onScreenText) {
    const cards = buildTextCards(onScreenText, duration, cta ? ctaLength : 0);
    tracks.push({
      clips: cards.map((card) => ({
        asset: textCardAsset(card.text),
        start: card.start,
        length: card.length,
        position: "bottom",
        offset: { y: 0.15 },
        opacity: 0.85,
        transition: { in: "fade", out: "fade" },
      })),
    });
  }

  // Bottom track: Runway AI video
  tracks.push({
    clips: [
      {
        asset: {
          type: "video",
          src: videoUrl,
          volume: 1,
        },
        start: 0,
        length: duration,
        fit: "cover",
      },
    ],
  });

  const timeline: Record<string, unknown> = {
    background: "#000000",
    fonts: [
      {
        src: "https://fonts.gstatic.com/s/montserrat/v29/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtr6Hw5aXo.woff2",
      },
    ],
    tracks,
  };

  // Add voiceover soundtrack if audioUrl provided
  if (audioUrl) {
    timeline.soundtrack = {
      src: audioUrl,
      effect: "fadeOut",
    };
  }

  const output = {
    format: "mp4",
    resolution: "hd",
    aspectRatio: "9:16",
    fps: 30,
  };

  try {
    const response = await shotstackRequest("/render", {
      method: "POST",
      body: JSON.stringify({ timeline, output }),
    });

    return NextResponse.json({
      ok: true,
      renderId: response.response?.id || response.id,
      provider: "shotstack",
      type: "compose",
      status: "queued",
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] Shotstack compose error:`, err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Shotstack compose failed",
      500,
      correlationId
    );
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
