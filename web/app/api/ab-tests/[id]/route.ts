import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/ab-tests/[id]
 * Fetch a single A/B test with joined skit data
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from("ab_tests")
    .select(`
      *,
      variant_a:variant_a_id(id, title, skit_data, ai_score),
      variant_b:variant_b_id(id, title, skit_data, ai_score),
      product:product_id(id, name, brand)
    `)
    .eq("id", id)
    .eq("user_id", authContext.user.id)
    .maybeSingle();

  if (error) {
    console.error(`[${correlationId}] Failed to fetch ab_test:`, error.message);
    return createApiErrorResponse("DB_ERROR", "Failed to fetch test", 500, correlationId);
  }

  if (!data) {
    return createApiErrorResponse("NOT_FOUND", "Test not found", 404, correlationId);
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}

/**
 * PATCH /api/ab-tests/[id]
 * Update an A/B test (declare winner, update status/notes)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  // Verify ownership
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("ab_tests")
    .select("id, user_id, status")
    .eq("id", id)
    .eq("user_id", authContext.user.id)
    .maybeSingle();

  if (fetchError) {
    return createApiErrorResponse("DB_ERROR", "Failed to fetch test", 500, correlationId);
  }
  if (!existing) {
    return createApiErrorResponse("NOT_FOUND", "Test not found", 404, correlationId);
  }

  // Build update payload
  const updates: Record<string, unknown> = {};

  if (typeof body.winner === "string" && ["a", "b"].includes(body.winner)) {
    updates.winner = body.winner;
    updates.status = "completed";
    updates.completed_at = new Date().toISOString();
  }
  if (typeof body.winner_reason === "string") {
    updates.winner_reason = body.winner_reason.trim() || null;
  }
  if (typeof body.status === "string" && ["active", "completed", "archived"].includes(body.status)) {
    updates.status = body.status;
    if (body.status === "completed" && !updates.completed_at) {
      updates.completed_at = new Date().toISOString();
    }
  }
  if (typeof body.notes === "string") {
    updates.notes = body.notes.trim() || null;
  }
  if (typeof body.metrics === "object" && body.metrics !== null) {
    updates.metrics = body.metrics;
  }

  if (Object.keys(updates).length === 0) {
    return createApiErrorResponse("VALIDATION_ERROR", "No valid fields to update", 400, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from("ab_tests")
    .update(updates)
    .eq("id", id)
    .eq("user_id", authContext.user.id)
    .select()
    .single();

  if (error) {
    console.error(`[${correlationId}] Failed to update ab_test:`, error.message);
    return createApiErrorResponse("DB_ERROR", "Failed to update test", 500, correlationId);
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}
