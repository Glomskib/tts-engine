import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { getRenderStatus } from "@/lib/shotstack";
import { getTaskStatus } from "@/lib/runway";

export const runtime = "nodejs";

type NormalizedStatus = "queued" | "processing" | "done" | "failed";

function normalizeShotstackStatus(status: string): NormalizedStatus {
  switch (status) {
    case "queued":
    case "fetching":
      return "queued";
    case "rendering":
    case "saving":
      return "processing";
    case "done":
      return "done";
    default:
      return "failed";
  }
}

function normalizeRunwayStatus(status: string): NormalizedStatus {
  switch (status) {
    case "PENDING":
    case "THROTTLED":
      return "queued";
    case "RUNNING":
      return "processing";
    case "SUCCEEDED":
      return "done";
    default:
      return "failed";
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");

  if (!provider || !["shotstack", "runway"].includes(provider)) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Query param 'provider' required: shotstack or runway",
      400,
      correlationId
    );
  }

  try {
    if (provider === "shotstack") {
      const result = await getRenderStatus(id);
      const render = result.response;
      return NextResponse.json({
        ok: true,
        data: {
          id,
          provider: "shotstack",
          status: normalizeShotstackStatus(render.status),
          raw_status: render.status,
          output_url: render.url || null,
          progress: null,
          error: render.error || null,
        },
        correlation_id: correlationId,
      });
    }

    // Runway
    const result = await getTaskStatus(id);
    return NextResponse.json({
      ok: true,
      data: {
        id,
        provider: "runway",
        status: normalizeRunwayStatus(result.status),
        raw_status: result.status,
        output_url: result.output?.[0] || null,
        progress: result.progress ?? null,
        error: result.failure || null,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status check failed";
    console.error(`[${correlationId}] Render status error (${provider}/${id}):`, err);
    return createApiErrorResponse("AI_ERROR", message, 502, correlationId);
  }
}
