import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { z } from "zod";

export const runtime = "nodejs";

const UpdateProductSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  brand: z.string().max(255).optional(),
  brand_id: z.string().uuid().optional().nullable(),
  category: z.string().max(255).optional(),
  product_display_name: z.string().max(30).optional().nullable(),
  description: z.string().max(10000).optional().nullable(),
  notes: z.string().max(10000).optional().nullable(),
  primary_link: z.string().max(2000).optional().nullable(),
  tiktok_showcase_url: z.string().max(2000).optional().nullable(),
  slug: z.string().max(255).optional().nullable(),
  category_risk: z.enum(["low", "medium", "high"]).optional().nullable(),
  product_image_url: z.string().max(2000).optional().nullable(),
  images: z.array(z.string()).optional(),
  pain_points: z.array(z.object({
    point: z.string(),
    category: z.enum(["emotional", "practical", "social", "financial"]),
    intensity: z.enum(["mild", "moderate", "severe"]),
    hook_angle: z.string(),
  })).optional().nullable(),
});

/**
 * GET /api/products/[id]
 * 
 * Fetch a single product by ID with all details including images
 * 
 * Auth: Bearer SERVICE_API_KEY (for Bolt) OR Supabase session (for FlashFlow UI)
 * 
 * Response:
 * {
 *   id, name, brand, brand_id, description, price, original_price,
 *   product_image_url, images, ai_enrichment, category, etc.
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - supports SESSION, API KEY (ff_ak_*), or SERVICE_API_KEY
  const auth = await validateApiAccess(request);
  if (!auth) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const { id: productId } = await params;

  if (!productId || productId === '') {
    return createApiErrorResponse("BAD_REQUEST", "Product ID is required", 400, correlationId);
  }

  try {
    // Fetch product with brand name via join
    const { data: product, error } = await supabaseAdmin
      .from("products")
      .select(`
        *,
        brand_entity:brands(id, name, brand_image_url)
      `)
      .eq("id", productId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return createApiErrorResponse("NOT_FOUND", "Product not found", 404, correlationId);
      }
      console.error(`[${correlationId}] Error fetching product:`, error);
      return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
    }

    if (!product) {
      return createApiErrorResponse("NOT_FOUND", "Product not found", 404, correlationId);
    }

    // Parse AI enrichment from notes if available
    let ai_enrichment = null;
    if (product.notes && product.notes.includes('=== AI ENRICHMENT ===')) {
      try {
        const enrichmentSection = product.notes.split('=== AI ENRICHMENT ===')[1];
        if (enrichmentSection) {
          ai_enrichment = {
            raw: enrichmentSection.trim(),
          };
        }
      } catch {
        // Ignore parsing errors
      }
    }

    // Build response with all relevant fields
    const response = {
      id: product.id,
      name: product.name,
      brand: product.brand,
      brand_id: product.brand_id,
      brand_name: product.brand_entity?.name || product.brand,
      brand_image_url: product.brand_entity?.brand_image_url || null,
      category: product.category,
      product_display_name: product.product_display_name,
      description: product.description,
      notes: product.notes,
      price: product.price,
      original_price: product.original_price,
      product_image_url: product.product_image_url,
      images: product.images || [],
      ai_enrichment,
      primary_link: product.primary_link,
      tiktok_showcase_url: product.tiktok_showcase_url,
      slug: product.slug,
      category_risk: product.category_risk,
      pain_points: product.pain_points,
      rotation_score: product.rotation_score,
      created_at: product.created_at,
      updated_at: product.updated_at,
    };

    return NextResponse.json({
      ok: true,
      data: response,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] Unexpected error:`, err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Internal server error",
      500,
      correlationId
    );
  }
}

/**
 * PATCH /api/products/[id]
 *
 * Update a product. Ownership is verified via user_id.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();
  const { id: productId } = await params;

  if (!productId) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Product ID is required",
      400,
      correlationId
    );
  }

  // Auth — session-based ownership check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId
    );
  }

  // Parse & validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Invalid JSON body",
      400,
      correlationId
    );
  }

  const parsed = UpdateProductSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse(
      "VALIDATION_ERROR",
      "Invalid input",
      400,
      correlationId,
      { issues: parsed.error.issues }
    );
  }

  const updates = parsed.data;

  if (Object.keys(updates).length === 0) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "No fields to update",
      400,
      correlationId
    );
  }

  try {
    // Verify ownership
    const { data: existing } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("user_id", authContext.user.id)
      .single();

    if (!existing) {
      return createApiErrorResponse(
        "NOT_FOUND",
        "Product not found",
        404,
        correlationId
      );
    }

    // Perform update
    const { data: updated, error } = await supabaseAdmin
      .from("products")
      .update(updates)
      .eq("id", productId)
      .eq("user_id", authContext.user.id)
      .select()
      .single();

    if (error) {
      console.error(`[${correlationId}] PATCH /api/products/[id] error:`, error);
      return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: updated,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] Unexpected error:`, err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Internal server error",
      500,
      correlationId
    );
  }
}
