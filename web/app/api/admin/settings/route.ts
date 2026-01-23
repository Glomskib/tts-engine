import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { getAllEffectiveSettings, ALLOWED_SETTING_KEYS } from "@/lib/settings";

export const runtime = "nodejs";

/**
 * GET /api/admin/settings
 * Admin-only endpoint to list current effective settings and their sources.
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get authentication context
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Admin-only
  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
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
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
