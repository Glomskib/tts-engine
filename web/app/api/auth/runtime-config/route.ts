import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { getEffectiveBoolean, getEffectiveNumber, getIncidentModeStatus } from "@/lib/settings";
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

    // Fetch settings and incident mode in parallel
    const [
      subscriptionGatingEnabled,
      emailEnabled,
      slackEnabled,
      assignmentTtlMinutes,
      incidentStatus,
      userPlan,
    ] = await Promise.all([
      getEffectiveBoolean("SUBSCRIPTION_GATING_ENABLED"),
      getEffectiveBoolean("EMAIL_ENABLED"),
      getEffectiveBoolean("SLACK_ENABLED"),
      getEffectiveNumber("ASSIGNMENT_TTL_MINUTES"),
      getIncidentModeStatus(),
      getUserPlan(userId),
    ]);

    // Check if user is on allowlist
    const isAllowlisted = incidentStatus.allowlistUserIds.includes(userId.toLowerCase());

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
        // Incident mode fields
        incident_mode_enabled: incidentStatus.enabled,
        incident_mode_message: incidentStatus.message,
        incident_mode_read_only: incidentStatus.readOnly,
        is_allowlisted: isAllowlisted,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/auth/runtime-config error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
