import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLogAsync, AuditEventTypes, EntityTypes } from "@/lib/audit";

export const runtime = "nodejs";

// Pain point schema
const PainPointSchema = z.object({
  point: z.string().min(1).max(500),
  category: z.enum(["emotional", "practical", "social", "financial"]),
  intensity: z.enum(["mild", "moderate", "severe"]),
  hook_angle: z.string().max(200).optional().default(''),
});

// Validation schema for product updates - use strict() to reject unknown fields
const UpdateProductSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  product_display_name: z
    .string()
    .max(30)
    .regex(/^[a-zA-Z0-9 ]*$/, "Only letters, numbers, and spaces allowed")
    .optional()
    .nullable(),
  brand: z.string().min(1).max(255).optional(),
  brand_id: z.string().uuid().optional().nullable(),
  category: z.string().min(1).max(100).optional(),
  category_risk: z.enum(["low", "medium", "high"]).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  primary_link: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().url().max(500).optional().nullable()
  ),
  tiktok_showcase_url: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().url().max(500).optional().nullable()
  ),
  slug: z.string().max(100).optional().nullable(),
  pain_points: z.array(PainPointSchema).optional().nullable(),
}).strict(); // Reject unknown fields

/**
 * GET /api/products/[id]
 * Fetch a single product by ID (must be owned by user or user is admin)
 */
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
    return createApiErrorResponse("BAD_REQUEST", "Product ID is required", 400, correlationId);
  }

  // Build query - admins can see all, users can only see their own
  let query = supabaseAdmin
    .from("products")
    .select("*")
    .eq("id", id.trim());

  if (!authContext.isAdmin) {
    query = query.eq("user_id", authContext.user.id);
  }

  const { data, error } = await query.single();

  if (error) {
    console.error("GET /api/products/[id] error:", error);
    if (error.code === "PGRST116") {
      return createApiErrorResponse("NOT_FOUND", "Product not found", 404, correlationId, { product_id: id.trim() });
    }
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  const response = NextResponse.json({ ok: true, data, correlation_id: correlationId });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}

/**
 * PATCH /api/products/[id]
 * Update a product by ID (admin only)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { id } = await params;

  // ============== ADMIN AUTHORIZATION CHECK ==============
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }
  // ========================================================

  if (!id || id.trim() === "") {
    return createApiErrorResponse("BAD_REQUEST", "Product ID is required", 400, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  // Validate input with strict mode (rejects unknown fields)
  const parseResult = UpdateProductSchema.safeParse(body);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map(e => `${e.path.join(".")}: ${e.message}`);
    return createApiErrorResponse("VALIDATION_ERROR", "Validation failed", 400, correlationId, { errors });
  }

  const updates = parseResult.data;

  // Check if any fields were provided
  if (Object.keys(updates).length === 0) {
    return createApiErrorResponse("BAD_REQUEST", "No fields to update", 400, correlationId);
  }

  // Verify product exists
  const { data: existing, error: existError } = await supabaseAdmin
    .from("products")
    .select("id, name, brand")
    .eq("id", id.trim())
    .single();

  if (existError || !existing) {
    return createApiErrorResponse("NOT_FOUND", "Product not found", 404, correlationId, { product_id: id.trim() });
  }

  // Build update payload (only include non-undefined fields)
  const updatePayload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      updatePayload[key] = value;
    }
  }

  // Update the product
  const { data, error } = await supabaseAdmin
    .from("products")
    .update(updatePayload)
    .eq("id", id.trim())
    .select()
    .single();

  if (error) {
    console.error("PATCH /api/products/[id] error:", error);
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  // Audit log for product update
  auditLogAsync({
    correlation_id: correlationId,
    event_type: AuditEventTypes.PRODUCT_UPDATED,
    entity_type: EntityTypes.PRODUCT,
    entity_id: id.trim(),
    actor: authContext.user?.id || "admin",
    summary: `Product ${existing.name} updated`,
    details: {
      updated_fields: Object.keys(updatePayload),
      previous_name: existing.name,
      previous_brand: existing.brand,
    },
  });

  const response = NextResponse.json({ ok: true, data, correlation_id: correlationId });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}

/**
 * DELETE /api/products/[id]
 * Delete a product by ID (admin only)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { id } = await params;

  // ============== ADMIN AUTHORIZATION CHECK ==============
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }
  // ========================================================

  if (!id || id.trim() === "") {
    return createApiErrorResponse("BAD_REQUEST", "Product ID is required", 400, correlationId);
  }

  // Verify product exists
  const { data: existing, error: existError } = await supabaseAdmin
    .from("products")
    .select("id")
    .eq("id", id.trim())
    .single();

  if (existError || !existing) {
    return createApiErrorResponse("NOT_FOUND", "Product not found", 404, correlationId, { product_id: id.trim() });
  }

  // Check if product has associated videos
  const { count: videoCount } = await supabaseAdmin
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id.trim());

  if (videoCount && videoCount > 0) {
    return createApiErrorResponse("BAD_REQUEST", `Cannot delete product with ${videoCount} associated videos. Archive instead.`, 400, correlationId, { video_count: videoCount });
  }

  const { error } = await supabaseAdmin
    .from("products")
    .delete()
    .eq("id", id.trim());

  if (error) {
    console.error("DELETE /api/products/[id] error:", error);
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  const response = NextResponse.json({ ok: true, deleted: id.trim(), correlation_id: correlationId });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}
