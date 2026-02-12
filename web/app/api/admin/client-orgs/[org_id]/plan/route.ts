import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getOrgPlan } from "@/lib/subscription";

export const runtime = "nodejs";

/**
 * GET /api/admin/client-orgs/[org_id]/plan
 * Get the plan for an organization
 */
export async function GET(
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
    const planInfo = await getOrgPlan(supabaseAdmin, orgId);

    return NextResponse.json({
      ok: true,
      data: {
        org_id: orgId,
        plan: planInfo.plan,
        billing_status: planInfo.billing_status,
      },
    });
  } catch (err) {
    console.error("[admin/client-orgs/plan] Error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
