import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { z } from "zod";

export const runtime = "nodejs";

// --- Validation Schemas ---

const AIScoreSchema = z.object({
  hook_strength: z.number().min(1).max(10),
  humor_level: z.number().min(1).max(10),
  product_integration: z.number().min(1).max(10),
  virality_potential: z.number().min(1).max(10),
  clarity: z.number().min(1).max(10),
  production_feasibility: z.number().min(1).max(10),
  audience_language: z.number().min(1).max(10).optional(),
  overall_score: z.number().min(1).max(10),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
});

const PerformanceMetricsSchema = z.object({
  view_count: z.number().int().min(0).optional(),
  engagement_rate: z.number().min(0).max(100).optional(),
  likes: z.number().int().min(0).optional(),
  comments: z.number().int().min(0).optional(),
  shares: z.number().int().min(0).optional(),
}).optional().nullable();

const UpdateSkitSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: z.enum(['draft', 'approved', 'produced', 'posted', 'archived']).optional(),
  user_rating: z.number().int().min(1).max(5).optional().nullable(),
  ai_score: AIScoreSchema.optional().nullable(),
  is_winner: z.boolean().optional(),
  performance_metrics: PerformanceMetricsSchema,
  posted_video_url: z.string().url().optional().nullable(),
  marked_winner_at: z.string().datetime().optional().nullable(),
}).strict();

// --- GET: Fetch a single skit ---

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { id } = await params;

  // Auth check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!id || id.trim() === "") {
    return createApiErrorResponse("BAD_REQUEST", "Skit ID is required", 400, correlationId);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("saved_skits")
      .select("*")
      .eq("id", id.trim())
      .eq("user_id", authContext.user.id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return createApiErrorResponse("NOT_FOUND", "Skit not found", 404, correlationId, { skit_id: id.trim() });
      }
      console.error(`[${correlationId}] Failed to fetch skit:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch skit", 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      data,
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (error) {
    console.error(`[${correlationId}] Skit fetch error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      error instanceof Error ? error.message : "Failed to fetch skit",
      500,
      correlationId
    );
  }
}

// --- PATCH: Update a skit ---

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { id } = await params;

  // Auth check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!id || id.trim() === "") {
    return createApiErrorResponse("BAD_REQUEST", "Skit ID is required", 400, correlationId);
  }

  // Parse and validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  const parseResult = UpdateSkitSchema.safeParse(body);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map(e => `${e.path.join(".")}: ${e.message}`);
    return createApiErrorResponse("VALIDATION_ERROR", "Validation failed", 400, correlationId, { errors });
  }

  const updates = parseResult.data;

  if (Object.keys(updates).length === 0) {
    return createApiErrorResponse("BAD_REQUEST", "No fields to update", 400, correlationId);
  }

  try {
    // Verify skit exists and belongs to user
    const { data: existing, error: existError } = await supabaseAdmin
      .from("saved_skits")
      .select("id, title")
      .eq("id", id.trim())
      .eq("user_id", authContext.user.id)
      .single();

    if (existError || !existing) {
      return createApiErrorResponse("NOT_FOUND", "Skit not found", 404, correlationId, { skit_id: id.trim() });
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        updatePayload[key] = value;
      }
    }

    // Update the skit
    const { data, error } = await supabaseAdmin
      .from("saved_skits")
      .update(updatePayload)
      .eq("id", id.trim())
      .eq("user_id", authContext.user.id)
      .select("id, title, status, user_rating, updated_at")
      .single();

    if (error) {
      console.error(`[${correlationId}] Failed to update skit:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to update skit", 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      data,
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (error) {
    console.error(`[${correlationId}] Skit update error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      error instanceof Error ? error.message : "Failed to update skit",
      500,
      correlationId
    );
  }
}

// --- DELETE: Delete a skit ---

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { id } = await params;

  // Auth check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!id || id.trim() === "") {
    return createApiErrorResponse("BAD_REQUEST", "Skit ID is required", 400, correlationId);
  }

  try {
    // Verify skit exists and belongs to user
    const { data: existing, error: existError } = await supabaseAdmin
      .from("saved_skits")
      .select("id")
      .eq("id", id.trim())
      .eq("user_id", authContext.user.id)
      .single();

    if (existError || !existing) {
      return createApiErrorResponse("NOT_FOUND", "Skit not found", 404, correlationId, { skit_id: id.trim() });
    }

    // Delete the skit
    const { error } = await supabaseAdmin
      .from("saved_skits")
      .delete()
      .eq("id", id.trim())
      .eq("user_id", authContext.user.id);

    if (error) {
      console.error(`[${correlationId}] Failed to delete skit:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to delete skit", 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      deleted: id.trim(),
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (error) {
    console.error(`[${correlationId}] Skit delete error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      error instanceof Error ? error.message : "Failed to delete skit",
      500,
      correlationId
    );
  }
}
