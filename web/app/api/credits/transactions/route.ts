import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

// GET: Fetch user's credit transactions
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    const { data: transactions, error } = await supabaseAdmin
      .from("credit_transactions")
      .select("id, type, amount, balance_after, description, created_at")
      .eq("user_id", authContext.user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error(`[${correlationId}] Failed to fetch transactions:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch transactions", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      transactions: transactions || [],
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Transactions error:`, error);
    return createApiErrorResponse("INTERNAL", "Failed to fetch transactions", 500, correlationId);
  }
}
