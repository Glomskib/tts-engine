import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { getPrimaryClientOrgForUser, getClientOrgById } from "@/lib/client-org";
import { getOrgBranding } from "@/lib/org-branding";

export const runtime = "nodejs";

/**
 * GET /api/client/branding
 * Get branding for the current user's organization
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Require authentication
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
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
    if (branding.org_display_name === "TTS Engine" && org?.org_name) {
      branding.org_display_name = org.org_name;
    }

    return NextResponse.json({
      ok: true,
      data: {
        org_id: membership.org_id,
        org_name: org?.org_name || membership.org_id,
        branding,
      },
    });
  } catch (err) {
    console.error("[client/branding] Error:", err);
    const apiErr = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...apiErr.body, correlation_id: correlationId }, { status: apiErr.status });
  }
}
