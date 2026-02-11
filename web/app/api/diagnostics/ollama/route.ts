/**
 * Ollama Diagnostics
 * GET /api/diagnostics/ollama
 * Returns availability, models, and latency.
 */

import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { getOllamaHealth } from "@/lib/ai/ollama";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user || !authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  const health = await getOllamaHealth();

  const res = NextResponse.json({
    ok: true,
    data: health,
    correlation_id: correlationId,
  });
  res.headers.set("x-correlation-id", correlationId);
  return res;
}
