import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getAllEffectiveSettings, ALLOWED_SETTING_KEYS } from "@/lib/settings";

export const runtime = "nodejs";

/**
 * GET /api/admin/settings
 * Admin-only endpoint to list current effective settings and their sources.
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get authentication context
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Admin-only
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  try {
    const settings = await getAllEffectiveSettings();

    return NextResponse.json({
      ok: true,
      data: {
        settings,
        allowed_keys: ALLOWED_SETTING_KEYS,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/admin/settings error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
