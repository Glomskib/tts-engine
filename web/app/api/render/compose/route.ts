import { NextResponse } from "next/server";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { shotstackRequest } from "@/lib/shotstack";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const ComposeSchema = z.object({
  videoUrl: z.string().url(),
  onScreenText: z.string().max(500).optional(),
  cta: z.string().max(200).optional(),
  hashtags: z.string().max(300).optional(),
  duration: z.number().min(1).max(120).optional(),
});

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

  const { videoUrl, onScreenText, cta, hashtags } = parsed.data;

  // Probe video duration if not provided — fall back to 10s default
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

  // Build Shotstack timeline — video on bottom track, text overlays on top
  const tracks: Record<string, unknown>[] = [];

  // Track 1 (top): CTA text in the last 4 seconds
  if (cta) {
    tracks.push({
      clips: [
        {
          asset: {
            type: "html",
            html: `<p style="font-family:Montserrat;font-weight:700;font-size:42px;color:#fff;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,0.9);padding:0 40px">${escapeHtml(cta)}</p>`,
            width: 1080,
            height: 400,
          },
          start: Math.max(0, duration - 4),
          length: Math.min(4, duration),
          position: "center",
          transition: { in: "fade", out: "fade" },
        },
      ],
    });
  }

  // Track 2: On-screen text for the first portion
  if (onScreenText) {
    tracks.push({
      clips: [
        {
          asset: {
            type: "html",
            html: `<p style="font-family:Montserrat;font-weight:600;font-size:36px;color:#fff;text-align:center;text-shadow:0 2px 6px rgba(0,0,0,0.9);padding:0 48px">${escapeHtml(onScreenText)}</p>`,
            width: 1080,
            height: 350,
          },
          start: 0.5,
          length: Math.min(duration - 0.5, 8),
          position: "bottom",
          offset: { y: 0.15 },
          transition: { in: "fade", out: "fade" },
        },
      ],
    });
  }

  // Track 3: Hashtag bar at the very bottom
  if (hashtags) {
    tracks.push({
      clips: [
        {
          asset: {
            type: "html",
            html: `<p style="font-family:Montserrat;font-size:22px;color:rgba(255,255,255,0.85);text-align:center;padding:12px 32px">${escapeHtml(hashtags)}</p>`,
            width: 1080,
            height: 120,
          },
          start: 0,
          length: duration,
          position: "bottom",
          offset: { y: 0.02 },
        },
      ],
    });
  }

  // Track 4 (bottom): Runway AI video — renders behind all overlays
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

  const timeline = {
    background: "#000000",
    fonts: [
      {
        src: "https://fonts.gstatic.com/s/montserrat/v29/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtr6Hw5aXo.woff2",
      },
    ],
    tracks,
  };

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
