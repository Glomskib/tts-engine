import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getFirstClientId } from "@/lib/marketplace/queries";
import { getUsageToday } from "@/lib/marketplace/usage";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/marketplace/usage
 *
 * Returns today's usage for the authenticated client:
 *   { used_today, daily_cap, remaining_today, resets_at, plan_tier, plan_label }
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const auth = await getApiAuthContext(request);

  if (!auth.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const clientId = await getFirstClientId(auth.user.id);
  if (!clientId) {
    return createApiErrorResponse("NOT_FOUND", "No marketplace client found", 404, correlationId);
  }

  const usage = await getUsageToday(clientId);

  return NextResponse.json({ ok: true, data: usage });
}
