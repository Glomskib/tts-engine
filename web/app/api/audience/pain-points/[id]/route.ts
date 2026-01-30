import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { z } from "zod";

export const runtime = "nodejs";

// --- Validation ---

const UpdatePainPointSchema = z.object({
  pain_point: z.string().min(1).max(500).optional(),
  category: z.string().max(50).optional().nullable(),
  when_it_happens: z.string().max(500).optional().nullable(),
  emotional_state: z.string().max(100).optional().nullable(),
  intensity: z.enum(["low", "medium", "high", "extreme"]).optional().nullable(),
  how_they_describe_it: z.array(z.string()).optional(),
  related_searches: z.array(z.string()).optional(),
  what_they_want: z.string().max(500).optional().nullable(),
  objections_to_solutions: z.array(z.string()).optional(),
  product_ids: z.array(z.string().uuid()).optional(),
});

// --- GET: Single pain point ---

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("pain_points")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return createApiErrorResponse("NOT_FOUND", "Pain point not found", 404, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Get pain point error:`, error);
    return createApiErrorResponse("INTERNAL", "Failed to fetch pain point", 500, correlationId);
  }
}

// --- PATCH: Update pain point ---

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  console.log(`[${correlationId}] Updating pain point ${id}, body:`, JSON.stringify(body).slice(0, 500));

  const parseResult = UpdatePainPointSchema.safeParse(body);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map(e => `${e.path.join(".")}: ${e.message}`);
    console.error(`[${correlationId}] Validation failed:`, errors);
    return createApiErrorResponse("VALIDATION_ERROR", errors.join(", "), 400, correlationId);
  }

  const updates = parseResult.data;
  console.log(`[${correlationId}] Validated updates:`, JSON.stringify(updates).slice(0, 500));

  try {
    const { data, error } = await supabaseAdmin
      .from("pain_points")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(`[${correlationId}] Failed to update pain point:`, error.message, error.details, error.hint);
      return createApiErrorResponse("DB_ERROR", `Failed to update pain point: ${error.message}`, 500, correlationId);
    }

    console.log(`[${correlationId}] Pain point updated successfully:`, data?.id);

    return NextResponse.json({
      ok: true,
      data,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Update pain point error:`, error);
    return createApiErrorResponse("INTERNAL", "Failed to update pain point", 500, correlationId);
  }
}

// --- DELETE: Delete pain point ---

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  try {
    const { error } = await supabaseAdmin
      .from("pain_points")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(`[${correlationId}] Failed to delete pain point:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to delete pain point", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      deleted: id,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Delete pain point error:`, error);
    return createApiErrorResponse("INTERNAL", "Failed to delete pain point", 500, correlationId);
  }
}
