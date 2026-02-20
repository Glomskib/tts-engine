import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";

export const runtime = "nodejs";

/**
 * GET /api/admin/hook-bank/export
 * Export all hooks as CSV download.
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("hook_bank_items")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.error("GET /api/admin/hook-bank/export error:", error);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch hooks", 500, correlationId);
    }

    const rows = data || [];

    // Build CSV
    const headers = ["id", "category", "hook_text", "angle", "compliance_notes", "status", "created_at", "source_doc_id", "lane", "tags"];
    const csvLines = [headers.join(",")];

    for (const row of rows) {
      const values = headers.map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return "";
        if (Array.isArray(val)) return `"${val.join(",")}"`;
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      csvLines.push(values.join(","));
    }

    const csv = csvLines.join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="hook-bank-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    console.error("GET /api/admin/hook-bank/export error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
