import { NextRequest, NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { shotstackRequest } from "@/lib/shotstack";
import { runwayRequest } from "@/lib/runway";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
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

      return NextResponse.json({
        ok: true,
        provider: "shotstack",
        id,
        status: render?.status || "unknown",
        url: render?.url || null,
        poster: render?.poster || null,
        correlation_id: correlationId,
      });
    } else {
      const response = await runwayRequest(`/v1/tasks/${id}`) as Record<string, unknown>;
      const output = response.output as string[] | undefined;

      return NextResponse.json({
        ok: true,
        provider: "runway",
        id,
        status: response.status || "unknown",
        url: output?.[0] || null,
        progress: response.progress || null,
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
