import { NextRequest, NextResponse } from "next/server";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { shotstackRequest } from "@/lib/shotstack";
import { runwayRequest } from "@/lib/runway";

export const runtime = "nodejs";
export const maxDuration = 60;

function normalizeRunwayStatus(raw: string): "processing" | "done" | "failed" | "unknown" {
  switch (raw) {
    case "THROTTLED":
    case "PENDING":
    case "RUNNING":
      return "processing";
    case "SUCCEEDED":
      return "done";
    case "FAILED":
      return "failed";
    default:
      return "unknown";
  }
}

function normalizeShotstackStatus(raw: string): "processing" | "done" | "failed" | "unknown" {
  switch (raw) {
    case "queued":
    case "fetching":
    case "rendering":
    case "saving":
      return "processing";
    case "done":
      return "done";
    case "failed":
      return "failed";
    default:
      return "unknown";
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const auth = await validateApiAccess(request);
  if (!auth) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const { id } = await params;
  const provider = request.nextUrl.searchParams.get("provider");

  if (!provider || !["shotstack", "runway"].includes(provider)) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Query param ?provider=shotstack|runway is required",
      400,
      correlationId
    );
  }

  try {
    if (provider === "shotstack") {
      const response = await shotstackRequest(`/render/${id}`);
      const render = response.response;
      const rawStatus = render?.status || "unknown";

      return NextResponse.json({
        ok: true,
        provider: "shotstack",
        id,
        status: normalizeShotstackStatus(rawStatus),
        rawStatus,
        url: render?.url || null,
        poster: render?.poster || null,
        error: rawStatus === "failed" ? (render?.error || null) : null,
        correlation_id: correlationId,
      });
    } else {
      const response = await runwayRequest(`/v1/tasks/${id}`) as Record<string, unknown>;
      const rawStatus = (response.status as string) || "unknown";
      const output = response.output as string[] | undefined;

      return NextResponse.json({
        ok: true,
        provider: "runway",
        id,
        status: normalizeRunwayStatus(rawStatus),
        rawStatus,
        url: rawStatus === "SUCCEEDED" ? (output?.[0] || null) : null,
        progress: response.progress || null,
        error: rawStatus === "FAILED" ? (response.failure as string || response.failureReason as string || null) : null,
        correlation_id: correlationId,
      });
    }
  } catch (err) {
    console.error(`[${correlationId}] Render status error (${provider}):`, err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Failed to check render status",
      500,
      correlationId
    );
  }
}
