import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { getUserPlan, isSubscriptionGatingEnabled } from "@/lib/subscription";
import { apiError, generateCorrelationId } from "@/lib/api-errors";

export const runtime = "nodejs";

/**
 * GET /api/auth/plan-status
 * Returns the authenticated user's subscription plan status.
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get authentication context
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const userId = authContext.user.id;

  try {
    const plan = await getUserPlan(userId);
    const gatingEnabled = isSubscriptionGatingEnabled();

    return NextResponse.json({
      ok: true,
      data: {
        plan: plan.plan,
        isActive: plan.isActive,
        gatingEnabled,
        isAdmin: authContext.isAdmin,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/auth/plan-status error:", err);
    const error = apiError("DB_ERROR", "Failed to get plan status", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
