import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/ab-tests
 * List user's A/B tests, optional ?status= filter
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");

  let query = supabaseAdmin
    .from("ab_tests")
    .select(`
      *,
      variant_a:variant_a_id(id, title),
      variant_b:variant_b_id(id, title),
      product:product_id(id, name, brand)
    `)
    .eq("user_id", authContext.user.id)
    .order("created_at", { ascending: false });

  if (statusFilter && ["active", "completed", "archived"].includes(statusFilter)) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`[${correlationId}] Failed to fetch ab_tests:`, error.message);
    return createApiErrorResponse("DB_ERROR", "Failed to fetch tests", 500, correlationId);
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}

/**
 * POST /api/ab-tests
 * Create a new A/B test
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("VALIDATION_ERROR", "Invalid JSON body", 400, correlationId);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return createApiErrorResponse("VALIDATION_ERROR", "name is required", 400, correlationId);
  }

  const variant_a_id = typeof body.variant_a_id === "string" ? body.variant_a_id : null;
  const variant_b_id = typeof body.variant_b_id === "string" ? body.variant_b_id : null;

  const { data, error } = await supabaseAdmin
    .from("ab_tests")
    .insert({
      user_id: authContext.user.id,
      name,
      product_id: typeof body.product_id === "string" ? body.product_id : null,
      hypothesis: typeof body.hypothesis === "string" ? body.hypothesis.trim() || null : null,
      variant_a_id,
      variant_b_id,
      variant_a_label: typeof body.variant_a_label === "string" ? body.variant_a_label : "Variant A",
      variant_b_label: typeof body.variant_b_label === "string" ? body.variant_b_label : "Variant B",
    })
    .select()
    .single();

  if (error) {
    console.error(`[${correlationId}] Failed to create ab_test:`, error.message);
    return createApiErrorResponse("DB_ERROR", "Failed to create test", 500, correlationId);
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId }, { status: 201 });
}
