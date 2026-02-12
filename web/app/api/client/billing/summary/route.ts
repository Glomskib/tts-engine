import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getPrimaryClientOrgForUser } from "@/lib/client-org";
import { computeOrgInvoicePreview } from "@/lib/billing";

export const runtime = "nodejs";

/**
 * GET /api/client/billing/summary
 * Get billing summary for the current user's organization
 *
 * Query params:
 * - year: YYYY (defaults to current year)
 * - month: 1-12 (defaults to current month)
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
    // Parse query params
    const url = new URL(request.url);
    const now = new Date();
    const yearParam = url.searchParams.get("year");
    const monthParam = url.searchParams.get("month");

    const year = yearParam ? parseInt(yearParam, 10) : now.getUTCFullYear();
    const month = monthParam ? parseInt(monthParam, 10) : now.getUTCMonth() + 1;

    // Validate year and month
    if (isNaN(year) || year < 2020 || year > 2100) {
      return createApiErrorResponse("BAD_REQUEST", "Invalid year parameter", 400, correlationId);
    }
    if (isNaN(month) || month < 1 || month > 12) {
      return createApiErrorResponse("BAD_REQUEST", "Invalid month parameter", 400, correlationId);
    }

    // Compute invoice preview
    const invoicePreview = await computeOrgInvoicePreview(
      supabaseAdmin,
      membership.org_id,
      year,
      month
    );

    return NextResponse.json({
      ok: true,
      data: invoicePreview,
    });
  } catch (err) {
    console.error("[client/billing/summary] Error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
