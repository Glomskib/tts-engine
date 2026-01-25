import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { ORG_PLAN_EVENT_TYPES, OrgBillingStatus } from "@/lib/subscription";

export const runtime = "nodejs";

const VALID_STATUSES: OrgBillingStatus[] = ["active", "trial", "past_due", "canceled"];

/**
 * POST /api/admin/client-orgs/[org_id]/billing-status/set
 * Set the billing status for an organization
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
    const { billing_status, reason } = body;

    // Validate billing status
    if (!billing_status || !VALID_STATUSES.includes(billing_status)) {
      const err = apiError("BAD_REQUEST", `Invalid billing_status. Must be one of: ${VALID_STATUSES.join(", ")}`, 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Insert billing status event in events_log
    const { error: eventError } = await supabaseAdmin
      .from("events_log")
      .insert({
        entity_type: "client_org",
        entity_id: orgId,
        event_type: ORG_PLAN_EVENT_TYPES.ORG_BILLING_STATUS_SET,
        payload: {
          billing_status,
          set_by_user_id: authContext.user.id,
          reason: reason || null,
        },
      });

    if (eventError) {
      console.error("[admin/client-orgs/billing-status/set] Event insert error:", eventError);
      const err = apiError("DB_ERROR", "Failed to set billing status", 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    return NextResponse.json({
      ok: true,
      data: {
        org_id: orgId,
        billing_status,
      },
    });
  } catch (err) {
    console.error("[admin/client-orgs/billing-status/set] Error:", err);
    const apiErr = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...apiErr.body, correlation_id: correlationId }, { status: apiErr.status });
  }
}
