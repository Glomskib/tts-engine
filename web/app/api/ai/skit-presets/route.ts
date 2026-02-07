import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { enforceRateLimits, extractRateLimitContext } from "@/lib/rate-limit";
import { getAllSkitPresets } from "@/lib/ai/skitPresets";

export const runtime = "nodejs";

/**
 * GET /api/ai/skit-presets
 * Returns list of available character presets for UI dropdown
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  try {
    // Auth check
    const authContext = await getApiAuthContext();
    if (!authContext.user) {
      return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
    }

    // Rate limiting (read-only - 30 req/min)
    const rateLimitResponse = enforceRateLimits(
      { userId: authContext.user.id, ...extractRateLimitContext(request) },
      correlationId,
      { userLimit: 30 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const presets = getAllSkitPresets();

    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data: presets,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch {
    return createApiErrorResponse("INTERNAL", "Failed to fetch presets", 500, correlationId);
  }
}
