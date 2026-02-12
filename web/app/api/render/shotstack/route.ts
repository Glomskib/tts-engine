import { NextResponse } from "next/server";
import { z } from "zod";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { renderVideo, createSimpleRender } from "@/lib/shotstack";

export const runtime = "nodejs";

const rawTimelineSchema = z.object({
  timeline: z.record(z.string(), z.unknown()),
  output: z.record(z.string(), z.unknown()).optional(),
});

const simpleParamsSchema = z.object({
  imageUrl: z.string().url().optional(),
  text: z.string().optional(),
  duration: z.number().min(1).max(60).optional(),
  background: z.string().optional(),
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

  // Try raw timeline first, then simplified params
  const rawParse = rawTimelineSchema.safeParse(body);
  if (rawParse.success) {
    try {
      const timeline = rawParse.data.timeline;
      const result = await renderVideo(timeline);
      return NextResponse.json({
        ok: true,
        data: {
          render_id: result.response?.id,
          provider: "shotstack",
        },
        correlation_id: correlationId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Shotstack render failed";
      console.error(`[${correlationId}] Shotstack raw render error:`, err);
      return createApiErrorResponse("AI_ERROR", message, 502, correlationId);
    }
  }

  const simpleParse = simpleParamsSchema.safeParse(body);
  if (!simpleParse.success) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Provide either { timeline } or { imageUrl, text, duration, background }",
      400,
      correlationId,
      { errors: simpleParse.error.flatten().fieldErrors }
    );
  }

  const { imageUrl, text, duration, background } = simpleParse.data;
  if (!imageUrl && !text && !background) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "At least one of imageUrl, text, or background is required",
      400,
      correlationId
    );
  }

  try {
    const result = await createSimpleRender({ imageUrl, text, duration, background });
    return NextResponse.json({
      ok: true,
      data: {
        render_id: result.response?.id,
        provider: "shotstack",
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Shotstack render failed";
    console.error(`[${correlationId}] Shotstack simple render error:`, err);
    return createApiErrorResponse("AI_ERROR", message, 502, correlationId);
  }
}
