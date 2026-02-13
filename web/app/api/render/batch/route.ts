import { NextResponse } from "next/server";
import { z } from "zod";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { renderVideo, createSimpleRender } from "@/lib/shotstack";
import { createTextToVideo, createImageToVideo, type RunwayModel } from "@/lib/runway";
import { runPreflight } from "@/app/api/render/preflight/[videoId]/route";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  model: z.enum(["gen3a_turbo", "gen4.5", "veo3", "veo3.1", "veo3.1_fast"]).optional(),
  duration: z.number().min(5).max(10).optional(),
  ratio: z.string().optional(),
  videoId: z.string().uuid().optional(),
});

const renderRequestSchema = z.discriminatedUnion("provider", [
  shotstackRequestSchema,
  runwayRequestSchema,
]);

const batchSchema = z.object({
  requests: z.array(renderRequestSchema).min(1).max(10),
  dryRun: z.boolean().optional(),
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
  const model: RunwayModel = req.model ?? "gen3a_turbo";
  const ratio = req.ratio ?? "768:1280";
  let result;
  if (req.imageUrl) {
    result = await createImageToVideo(req.imageUrl, req.prompt, model, req.duration, ratio);
  } else {
    result = await createTextToVideo(req.prompt, model, req.duration, ratio);
  }

  // Save prompt to video record if videoId provided
  if (req.videoId && result.id) {
    await supabaseAdmin
      .from("videos")
      .update({ render_prompt: req.prompt, render_task_id: String(result.id), render_provider: "runway" })
      .eq("id", req.videoId);
  }

  return { provider: "runway", task_id: result.id };
}

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

  const isDryRun = parsed.data.dryRun === true;

  const results: Array<
    | { provider: "shotstack"; render_id: string }
    | { provider: "runway"; task_id: string }
    | { provider: string; error: string; preflight_skipped?: boolean; checks?: Record<string, unknown> }
    | { provider: string; dryRun: true; wouldRender: boolean; checks?: Record<string, unknown>; videoId?: string }
  > = [];

  for (const req of parsed.data.requests) {
    // Dry run: run preflight only, never call providers
    if (isDryRun) {
      if (req.provider === "runway" && req.videoId) {
        const preflight = await runPreflight(req.videoId);
        results.push({
          provider: "runway",
          dryRun: true,
          wouldRender: preflight.ready,
          checks: preflight.checks,
          videoId: req.videoId,
        });
      } else {
        results.push({
          provider: req.provider,
          dryRun: true,
          wouldRender: req.provider === "shotstack",
          ...(req.provider === "runway" ? { checks: undefined, videoId: undefined } : {}),
        });
      }
      continue;
    }

    if (req.provider === "shotstack") {
      try {
        results.push(await executeShotstackRequest(req));
      } catch (err) {
        results.push({
          provider: "shotstack",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
      continue;
    }

    // Runway: run preflight if videoId provided
    if (req.videoId) {
      const preflight = await runPreflight(req.videoId);
      if (!preflight.ready) {
        const failedChecks = Object.entries(preflight.checks)
          .filter(([, v]) => !v.pass)
          .map(([k, v]) => `${k}: ${v.detail}`);
        results.push({
          provider: "runway",
          error: `Preflight failed: ${failedChecks.join("; ")}`,
          preflight_skipped: true,
          checks: preflight.checks,
        });
        continue;
      }
    }

    try {
      results.push(await executeRunwayRequest(req));
    } catch (err) {
      results.push({
        provider: "runway",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const submitted = isDryRun ? 0 : results.filter((r) => !("error" in r) && !("dryRun" in r)).length;
  const wouldRender = isDryRun ? results.filter((r) => "wouldRender" in r && r.wouldRender).length : undefined;
  const wouldSkip = isDryRun ? results.filter((r) => "wouldRender" in r && !r.wouldRender).length : undefined;
  const skipped = results.filter((r) => "preflight_skipped" in r).length;
  const failed = isDryRun ? 0 : results.length - submitted;

  return NextResponse.json({
    ok: true,
    data: {
      dryRun: isDryRun,
      results,
      submitted,
      ...(isDryRun ? { wouldRender, wouldSkip } : {}),
      skipped,
      failed,
    },
    correlation_id: correlationId,
  });
}
