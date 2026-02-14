import { NextResponse } from "next/server";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { submitComposeV2 } from "@/lib/shotstack-compose-v2";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const ComposeV2Schema = z.object({
  videoId: z.string().uuid().optional(),
  heygenUrl: z.string().url(),
  brollClips: z.array(z.string().url()).min(1).max(10),
  onScreenText: z.array(z.string().max(200)).max(10).optional(),
  captions: z.array(z.string().max(300)).max(20).optional(),
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

  const parsed = ComposeV2Schema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse("VALIDATION_ERROR", "Invalid input", 400, correlationId, {
      issues: parsed.error.issues,
    });
  }

  const { videoId, heygenUrl, brollClips, onScreenText, captions, duration } = parsed.data;

  try {
    const result = await submitComposeV2({
      heygenUrl,
      brollClips,
      onScreenText,
      captions,
      duration,
    });

    // If videoId provided, update the video record with compose_render_id
    if (videoId) {
      await supabaseAdmin
        .from("videos")
        .update({ compose_render_id: result.renderId })
        .eq("id", videoId);
    }

    return NextResponse.json({
      ok: true,
      renderId: result.renderId,
      provider: "shotstack",
      type: "compose-v2",
      status: "queued",
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] Shotstack compose-v2 error:`, err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Shotstack compose-v2 failed",
      500,
      correlationId
    );
  }
}
