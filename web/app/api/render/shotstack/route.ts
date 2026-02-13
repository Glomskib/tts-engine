import { NextResponse } from "next/server";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { shotstackRequest } from "@/lib/shotstack";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const RenderSchema = z.object({
  productImageUrl: z.string().url(),
  spokenText: z.string().min(1).max(5000),
  onScreenText: z.string().max(500).optional(),
  cta: z.string().max(200).optional(),
  duration: z.number().min(5).max(120).optional(),
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

  const parsed = RenderSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse("VALIDATION_ERROR", "Invalid input", 400, correlationId, {
      issues: parsed.error.issues,
    });
  }

  const { productImageUrl, spokenText, onScreenText, cta, duration = 30 } = parsed.data;

  // Block domains known to reject Shotstack's render servers.
  // HEAD requests from our API server may succeed, but Shotstack's render
  // farm gets blocked — causing "File not found: undefined" at render time.
  const blockedHosts = ["m.media-amazon.com", "images-na.ssl-images-amazon.com", "images-amazon.com"];
  try {
    const imageHost = new URL(productImageUrl).hostname;
    if (blockedHosts.some((h) => imageHost === h || imageHost.endsWith(`.${h}`))) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        `Amazon CDN images (${imageHost}) block Shotstack's render servers. Re-host the image on Supabase Storage, Cloudflare, or any public CDN first.`,
        400,
        correlationId
      );
    }
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid image URL", 400, correlationId);
  }

  // Build Shotstack timeline — image track on bottom, overlays on top
  const tracks: Record<string, unknown>[] = [];

  // CTA overlay at the end (top track = renders on top)
  if (cta) {
    tracks.push({
      clips: [
        {
          asset: {
            type: "title",
            text: cta,
            style: "blockbuster",
          },
          start: Math.max(0, duration - 5),
          length: 5,
          position: "center",
        },
      ],
    });
  }

  // On-screen text overlay
  if (onScreenText) {
    tracks.push({
      clips: [
        {
          asset: {
            type: "title",
            text: onScreenText,
            style: "subtitle",
          },
          start: 0,
          length: Math.min(duration, 10),
          position: "bottom",
        },
      ],
    });
  }

  // Product image (bottom track = renders behind overlays)
  tracks.push({
    clips: [
      {
        asset: { type: "image", src: productImageUrl },
        start: 0,
        length: duration,
        fit: "contain",
      },
    ],
  });

  const timeline = {
    background: "#000000",
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
      status: "queued",
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] Shotstack render error:`, err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Shotstack render failed",
      500,
      correlationId
    );
  }
}
