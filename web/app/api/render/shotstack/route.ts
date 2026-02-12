import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
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

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
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

  // Build Shotstack timeline
  const clips: Record<string, unknown>[] = [
    {
      asset: { type: "image", src: productImageUrl },
      start: 0,
      length: duration,
      fit: "contain",
    },
  ];

  const tracks: Record<string, unknown>[] = [{ clips }];

  // On-screen text overlay
  if (onScreenText) {
    tracks.unshift({
      clips: [
        {
          asset: {
            type: "title",
            text: onScreenText,
            style: "subtitle",
            size: "medium",
          },
          start: 0,
          length: Math.min(duration, 10),
          position: "bottom",
        },
      ],
    });
  }

  // CTA overlay at the end
  if (cta) {
    tracks.unshift({
      clips: [
        {
          asset: {
            type: "title",
            text: cta,
            style: "blockbuster",
            size: "large",
          },
          start: Math.max(0, duration - 5),
          length: 5,
          position: "center",
        },
      ],
    });
  }

  const timeline = {
    background: "#000000",
    tracks,
  };

  const output = {
    format: "mp4",
    resolution: "hd",
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
