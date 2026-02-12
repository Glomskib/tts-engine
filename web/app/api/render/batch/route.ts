import { NextResponse } from "next/server";
import { z } from "zod";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { renderVideo, createSimpleRender } from "@/lib/shotstack";
import { createTextToVideo, createImageToVideo, type RunwayModel } from "@/lib/runway";

export const runtime = "nodejs";

const shotstackRequestSchema = z.object({
  provider: z.literal("shotstack"),
  timeline: z.record(z.string(), z.unknown()).optional(),
  imageUrl: z.string().url().optional(),
  text: z.string().optional(),
  duration: z.number().min(1).max(60).optional(),
  background: z.string().optional(),
});

const runwayRequestSchema = z.object({
  provider: z.literal("runway"),
  prompt: z.string().min(1).max(2000),
  imageUrl: z.string().url().optional(),
  model: z.enum(["gen4_turbo", "gen3a_turbo"]).optional(),
  duration: z.number().min(5).max(10).optional(),
});

const renderRequestSchema = z.discriminatedUnion("provider", [
  shotstackRequestSchema,
  runwayRequestSchema,
]);

const batchSchema = z.object({
  requests: z.array(renderRequestSchema).min(1).max(10),
});

async function executeShotstackRequest(
  req: z.infer<typeof shotstackRequestSchema>
): Promise<{ provider: "shotstack"; render_id: string }> {
  if (req.timeline) {
    const result = await renderVideo(req.timeline);
    return { provider: "shotstack", render_id: result.response?.id };
  }
  const result = await createSimpleRender({
    imageUrl: req.imageUrl,
    text: req.text,
    duration: req.duration,
    background: req.background,
  });
  return { provider: "shotstack", render_id: result.response?.id };
}

async function executeRunwayRequest(
  req: z.infer<typeof runwayRequestSchema>
): Promise<{ provider: "runway"; task_id: string }> {
  const model: RunwayModel = req.model ?? "gen4_turbo";
  let result;
  if (req.imageUrl) {
    result = await createImageToVideo(req.imageUrl, req.prompt, model, req.duration);
  } else {
    result = await createTextToVideo(req.prompt, model, req.duration);
  }
  return { provider: "runway", task_id: result.id };
}

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

  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Invalid batch request",
      400,
      correlationId,
      { errors: parsed.error.flatten().fieldErrors }
    );
  }

  const promises = parsed.data.requests.map((req) => {
    if (req.provider === "shotstack") {
      return executeShotstackRequest(req);
    }
    return executeRunwayRequest(req);
  });

  const settled = await Promise.allSettled(promises);

  const results = settled.map((result, i) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      provider: parsed.data.requests[i].provider,
      error: result.reason instanceof Error ? result.reason.message : "Unknown error",
    };
  });

  const submitted = results.filter((r) => !("error" in r)).length;
  const failed = results.length - submitted;

  return NextResponse.json({
    ok: true,
    data: {
      results,
      submitted,
      failed,
    },
    correlation_id: correlationId,
  });
}
