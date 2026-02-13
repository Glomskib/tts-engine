import { NextResponse } from "next/server";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { runwayRequest } from "@/lib/runway";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const RunwaySchema = z.object({
  promptText: z.string().min(1).max(2000),
  promptImageUrl: z.string().url().optional(),
  model: z.enum(["gen3a_turbo", "gen4.5", "veo3", "veo3.1", "veo3.1_fast"]).optional().default("gen4.5"),
  duration: z.enum(["5", "10"]).optional().default("10"),
  ratio: z.string().optional().default("720:1280"),
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

  const { promptText, promptImageUrl, model, duration, ratio } = parsed.data;

  try {
    let response: Record<string, unknown>;

    if (promptImageUrl) {
      response = await runwayRequest("/v1/image_to_video", {
        method: "POST",
        body: JSON.stringify({
          model,
          promptImage: promptImageUrl,
          promptText,
          duration: parseInt(duration),
          ratio,
        }),
      });
    } else {
      response = await runwayRequest("/v1/text_to_video", {
        method: "POST",
        body: JSON.stringify({
          model,
          promptText,
          duration: parseInt(duration),
          ratio,
        }),
      });
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
