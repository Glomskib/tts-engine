import { NextResponse } from "next/server";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { submitCompose } from "@/lib/compose";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const ComposeSchema = z.object({
  videoUrl: z.string().url(),
  audioUrl: z.string().url().optional(),
  onScreenText: z.string().max(500).optional(),
  cta: z.string().max(200).optional(),
  duration: z.number().min(1).max(120).optional(),
  productImageUrl: z.string().url().optional(),
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

  const { videoUrl, audioUrl, onScreenText, cta, productImageUrl } = parsed.data;

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

  try {
    const result = await submitCompose({ videoUrl, audioUrl, onScreenText, cta, duration, productImageUrl });

    return NextResponse.json({
      ok: true,
      renderId: result.renderId,
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
