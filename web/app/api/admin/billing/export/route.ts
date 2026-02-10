import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAllOrgInvoicePreviews, generateBillingCsv } from "@/lib/billing";

export const runtime = "nodejs";

/**
 * GET /api/admin/billing/export
 * Admin-only endpoint to export billing data as CSV.
 * Query params:
 * - year: YYYY (defaults to current year)
 * - month: 1-12 (defaults to current month)
 * - type: csv (only csv supported currently)
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get authentication context
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Admin-only
  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    // Parse query params
    const url = new URL(request.url);
    const now = new Date();
    const yearParam = url.searchParams.get("year");
    const monthParam = url.searchParams.get("month");
    const type = url.searchParams.get("type") || "csv";

    const year = yearParam ? parseInt(yearParam, 10) : now.getUTCFullYear();
    const month = monthParam ? parseInt(monthParam, 10) : now.getUTCMonth() + 1;

    // Validate year and month
    if (isNaN(year) || year < 2020 || year > 2100) {
      const err = apiError("BAD_REQUEST", "Invalid year parameter", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    if (isNaN(month) || month < 1 || month > 12) {
      const err = apiError("BAD_REQUEST", "Invalid month parameter", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Only CSV supported
    if (type !== "csv") {
      const err = apiError("BAD_REQUEST", "Only type=csv is supported", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Get all org invoice previews
    const previews = await getAllOrgInvoicePreviews(supabaseAdmin, year, month);

    // Generate CSV
    const csv = generateBillingCsv(previews);

    // Format filename
    const monthStr = month.toString().padStart(2, "0");
    const filename = `billing-${year}-${monthStr}.csv`;

    // Return CSV response
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Correlation-ID": correlationId,
      },
    });
  } catch (err) {
    console.error("GET /api/admin/billing/export error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
