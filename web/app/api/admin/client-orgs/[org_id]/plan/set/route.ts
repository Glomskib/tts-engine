import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { ORG_PLAN_EVENT_TYPES, OrgPlanType } from "@/lib/subscription";

export const runtime = "nodejs";

const VALID_PLANS: OrgPlanType[] = ["free", "pro", "enterprise"];

/**
 * POST /api/admin/client-orgs/[org_id]/plan/set
 * Set the plan for an organization
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ org_id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { org_id: orgId } = await params;

  // Require authentication
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Check admin role
  if (authContext.role !== "admin") {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate org_id format
  if (!orgId || !orgId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    const err = apiError("BAD_REQUEST", "Invalid organization ID format", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    const body = await request.json();
    const { plan, reason } = body;

    // Validate plan
    if (!plan || !VALID_PLANS.includes(plan)) {
      const err = apiError("BAD_REQUEST", `Invalid plan. Must be one of: ${VALID_PLANS.join(", ")}`, 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Insert plan event
    const { error: eventError } = await supabaseAdmin
      .from("video_events")
      .insert({
        video_id: null, // Org-level event
        event_type: ORG_PLAN_EVENT_TYPES.ORG_SET_PLAN,
        user_id: authContext.user.id,
        details: {
          org_id: orgId,
          plan,
          set_by_user_id: authContext.user.id,
          reason: reason || null,
        },
      });

    if (eventError) {
      console.error("[admin/client-orgs/plan/set] Event insert error:", eventError);
      const err = apiError("DB_ERROR", "Failed to set organization plan", 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    return NextResponse.json({
      ok: true,
      data: {
        org_id: orgId,
        plan,
      },
    });
  } catch (err) {
    console.error("[admin/client-orgs/plan/set] Error:", err);
    const apiErr = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...apiErr.body, correlation_id: correlationId }, { status: apiErr.status });
  }
}
