import { NextResponse } from "next/server";
import { z } from "zod";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createTextToVideo, createImageToVideo, type RunwayModel } from "@/lib/runway";

export const runtime = "nodejs";

const requestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  imageUrl: z.string().url().optional(),
  model: z.enum(["gen4_turbo", "gen3a_turbo"]).optional(),
  duration: z.number().min(5).max(10).optional(),
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

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Invalid request body",
      400,
      correlationId,
      { errors: parsed.error.flatten().fieldErrors }
    );
  }

  const { prompt, imageUrl, model, duration } = parsed.data;
  const selectedModel: RunwayModel = model ?? "gen4_turbo";

  try {
    let result;
    if (imageUrl) {
      result = await createImageToVideo(imageUrl, prompt, selectedModel, duration);
    } else {
      result = await createTextToVideo(prompt, selectedModel, duration);
    }

    return NextResponse.json({
      ok: true,
      data: {
        task_id: result.id,
        provider: "runway",
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Runway generation failed";
    console.error(`[${correlationId}] Runway error:`, err);

    if (message.includes("402") || message.includes("insufficient")) {
      return createApiErrorResponse("INSUFFICIENT_CREDITS", message, 402, correlationId);
    }

    return createApiErrorResponse("AI_ERROR", message, 502, correlationId);
  }
}
