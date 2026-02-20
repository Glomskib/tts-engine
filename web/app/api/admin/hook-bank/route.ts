import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";

export const runtime = "nodejs";

/**
 * GET /api/admin/hook-bank
 * List hooks with optional search and filters.
 * Query params: search, category, status, tag, limit, offset
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
    const url = new URL(request.url);
    const search = url.searchParams.get("search") || "";
    const category = url.searchParams.get("category") || "";
    const status = url.searchParams.get("status") || "";
    const tag = url.searchParams.get("tag") || "";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "200"), 500);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    let query = supabaseAdmin
      .from("hook_bank_items")
      .select("*", { count: "exact" })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike("hook_text", `%${search}%`);
    }
    if (category) {
      query = query.eq("category", category);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (tag) {
      query = query.contains("tags", [tag]);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("GET /api/admin/hook-bank error:", error);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch hooks", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: { hooks: data, total: count },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/admin/hook-bank error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}

/**
 * POST /api/admin/hook-bank
 * Upsert hooks. Body: { hooks: Array<{ id?, category, hook_text, angle?, compliance_notes?, status?, source_doc_id?, lane?, tags? }> }
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  try {
    const body = await request.json();
    const hooks = body.hooks;

    if (!Array.isArray(hooks) || hooks.length === 0) {
      return createApiErrorResponse("BAD_REQUEST", "hooks array is required", 400, correlationId);
    }

    const { data, error } = await supabaseAdmin
      .from("hook_bank_items")
      .upsert(hooks, { onConflict: "id" })
      .select();

    if (error) {
      console.error("POST /api/admin/hook-bank error:", error);
      return createApiErrorResponse("DB_ERROR", "Failed to upsert hooks", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: { upserted: data?.length || 0 },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("POST /api/admin/hook-bank error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
