import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
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
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Check admin role
  if (authContext.role !== "admin") {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  // Validate org_id format
  if (!orgId || !orgId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    return createApiErrorResponse("BAD_REQUEST", "Invalid organization ID format", 400, correlationId);
  }

  try {
    const body = await request.json();
    const { plan, reason } = body;

    // Validate plan
    if (!plan || !VALID_PLANS.includes(plan)) {
      return createApiErrorResponse("BAD_REQUEST", `Invalid plan. Must be one of: ${VALID_PLANS.join(", ")}`, 400, correlationId);
    }

    // Insert plan event in events_log
    const { error: eventError } = await supabaseAdmin
      .from("events_log")
      .insert({
        entity_type: "client_org",
        entity_id: orgId,
        event_type: ORG_PLAN_EVENT_TYPES.ORG_SET_PLAN,
        payload: {
          plan,
          set_by_user_id: authContext.user.id,
          reason: reason || null,
        },
      });

    if (eventError) {
      console.error("[admin/client-orgs/plan/set] Event insert error:", eventError);
      return createApiErrorResponse("DB_ERROR", "Failed to set organization plan", 500, correlationId);
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
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
