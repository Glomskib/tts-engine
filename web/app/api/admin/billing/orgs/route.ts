import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAllOrgInvoicePreviews } from "@/lib/billing";

export const runtime = "nodejs";

/**
 * GET /api/admin/billing/orgs
 * Admin-only endpoint to get invoice previews for all organizations.
 * Query params:
 * - year: YYYY (defaults to current year)
 * - month: 1-12 (defaults to current month)
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get authentication context
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Admin-only
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
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

    // Get all org invoice previews
    const previews = await getAllOrgInvoicePreviews(supabaseAdmin, year, month);

    // Compute totals
    const totals = {
      org_count: previews.length,
      total_posted_videos: previews.reduce((sum, p) => sum + p.posted_videos, 0),
      total_overage_videos: previews.reduce((sum, p) => sum + p.overage_videos, 0),
      total_base_fee_cents: previews.reduce((sum, p) => sum + p.base_fee_cents, 0),
      total_overage_fee_cents: previews.reduce((sum, p) => sum + p.overage_fee_cents, 0),
      total_estimated_cents: previews.reduce((sum, p) => sum + p.estimated_total_cents, 0),
    };

    return NextResponse.json({
      ok: true,
      data: {
        year,
        month,
        period_label: new Date(year, month - 1, 1).toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        }),
        orgs: previews,
        totals,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/admin/billing/orgs error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
