import { NextResponse } from "next/server";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { runwayRequest } from "@/lib/runway";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const RunwaySchema = z.object({
  promptText: z.string().min(1).max(2000),
  promptImageUrl: z.string().url().optional(),
  model: z.enum(["gen3a_turbo", "gen4_turbo", "gen4.5", "veo3", "veo3.1", "veo3.1_fast"]).optional().default("gen4.5"),
  duration: z.union([z.literal(5), z.literal(10), z.literal("5"), z.literal("10")]).optional().default(10),
  ratio: z.string().optional().default("720:1280"),
  videoId: z.string().uuid().optional(),
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

  const parsed = RunwaySchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse("VALIDATION_ERROR", "Invalid input", 400, correlationId, {
      issues: parsed.error.issues,
    });
  }

  const { promptText, promptImageUrl, duration, ratio, videoId } = parsed.data;

  // Image-to-video is REQUIRED — text-to-video produces garbled labels
  if (!promptImageUrl) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Product image required — Runway cannot generate readable labels without a reference image. Upload a product image first.",
      422,
      correlationId
    );
  }

  // Map legacy/alias model names to available Runway models
  const modelAliases: Record<string, string> = {
    gen4_turbo: "gen4.5",
    gen3a_turbo: "gen4.5",
  };
  const model = modelAliases[parsed.data.model] || parsed.data.model;

  try {
    const response = await runwayRequest("/v1/image_to_video", {
      method: "POST",
      body: JSON.stringify({
        model,
        promptImage: promptImageUrl,
        promptText,
        duration: Number(duration),
        ratio,
      }),
    });

    // Save prompt to video record if videoId provided
    if (videoId && response.id) {
      await supabaseAdmin
        .from("videos")
        .update({ render_prompt: promptText, render_task_id: String(response.id), render_provider: "runway" })
        .eq("id", videoId);
    }

    return NextResponse.json({
      ok: true,
      taskId: response.id,
      provider: "runway",
      status: "queued",
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] Runway render error:`, err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Runway render failed",
      500,
      correlationId
    );
  }
}
