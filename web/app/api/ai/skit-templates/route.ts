import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { getAllSkitTemplates } from "@/lib/ai/skitTemplates";

export const runtime = "nodejs";

/**
 * GET /api/ai/skit-templates
 * Returns list of available skit templates for UI dropdown
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const templates = getAllSkitTemplates();

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data: templates,
  });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}
