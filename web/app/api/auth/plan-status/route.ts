import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { getUserPlan } from "@/lib/subscription";
import { getPlanByStringId } from "@/lib/plans";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";

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
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const userId = authContext.user.id;

  try {
    const plan = await getUserPlan(userId);
    const planConfig = getPlanByStringId(plan.plan);

    return NextResponse.json({
      ok: true,
      data: {
        plan: plan.plan,
        planName: planConfig?.name || plan.plan,
        isActive: plan.isActive,
        isAdmin: authContext.isAdmin,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/auth/plan-status error:", err);
    return createApiErrorResponse("DB_ERROR", "Failed to get plan status", 500, correlationId);
  }
}
