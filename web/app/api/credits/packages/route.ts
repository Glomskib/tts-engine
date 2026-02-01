import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// GET: Fetch available credit packages
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  try {
    const { data: packages, error } = await supabaseAdmin
      .from("credit_packages")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error(`[${correlationId}] Failed to fetch packages:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch packages", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      packages: packages || [],
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Packages error:`, error);
    return createApiErrorResponse("INTERNAL", "Failed to fetch packages", 500, correlationId);
  }
}
