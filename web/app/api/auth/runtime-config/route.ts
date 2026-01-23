import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { getEffectiveBoolean, getEffectiveNumber } from "@/lib/settings";
import { getUserPlan } from "@/lib/subscription";

export const runtime = "nodejs";

/**
 * GET /api/auth/runtime-config
 * Returns safe-to-expose runtime config for the logged-in user.
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get authentication context
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    const userId = authContext.user.id;

    // Fetch settings
    const [
      subscriptionGatingEnabled,
      emailEnabled,
      slackEnabled,
      assignmentTtlMinutes,
    ] = await Promise.all([
      getEffectiveBoolean("SUBSCRIPTION_GATING_ENABLED"),
      getEffectiveBoolean("EMAIL_ENABLED"),
      getEffectiveBoolean("SLACK_ENABLED"),
      getEffectiveNumber("ASSIGNMENT_TTL_MINUTES"),
    ]);

    // Get user plan
    const userPlan = await getUserPlan(userId);

    return NextResponse.json({
      ok: true,
      data: {
        is_admin: authContext.isAdmin,
        subscription_gating_enabled: subscriptionGatingEnabled,
        email_enabled: emailEnabled,
        slack_enabled: slackEnabled,
        assignment_ttl_minutes: assignmentTtlMinutes,
        user_plan: userPlan.plan,
        user_plan_active: userPlan.isActive,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/auth/runtime-config error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
