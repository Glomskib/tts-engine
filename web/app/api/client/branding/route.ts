import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getPrimaryClientOrgForUser, getClientOrgById } from "@/lib/client-org";
import { getOrgBranding } from "@/lib/org-branding";
import { getOrgPlan, isPaidOrgPlan } from "@/lib/subscription";

export const runtime = "nodejs";

/**
 * GET /api/client/branding
 * Get branding for the current user's organization
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Require authentication
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Get user's primary organization
  const membership = await getPrimaryClientOrgForUser(supabaseAdmin, authContext.user.id);
  if (!membership) {
    return NextResponse.json({
      ok: false,
      error: "client_org_required",
      message: "Your portal is not yet connected to an organization. Contact support.",
      correlation_id: correlationId,
    }, { status: 403 });
  }

  try {
    // Get org details for name fallback
    const org = await getClientOrgById(supabaseAdmin, membership.org_id);

    // Get branding
    const branding = await getOrgBranding(supabaseAdmin, membership.org_id);

    // If org_display_name not customized, use org name from creation event
    if ((branding.org_display_name === "TTS Engine" || branding.org_display_name === "FlashFlow AI") && org?.org_name) {
      branding.org_display_name = org.org_name;
    }

    // Get org plan for feature flags
    const orgPlanInfo = await getOrgPlan(supabaseAdmin, membership.org_id);
    const isPaid = isPaidOrgPlan(orgPlanInfo.plan);

    // Determine which branding features are allowed based on plan
    const branding_allowed = {
      org_display_name: true, // Always allowed
      logo: isPaid,
      accent: isPaid,
      welcome: isPaid,
    };

    return NextResponse.json({
      ok: true,
      data: {
        org_id: membership.org_id,
        org_name: org?.org_name || membership.org_id,
        branding,
        plan: orgPlanInfo.plan,
        billing_status: orgPlanInfo.billing_status,
        branding_allowed,
      },
    });
  } catch (err) {
    console.error("[client/branding] Error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
