import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { auditLogAsync } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * GET /api/products
 *
 * List all products for the authenticated user with optional filtering and pagination
 *
 * Query params:
 * - brand: Filter by brand name (case-insensitive exact match)
 * - brand_id: Filter by brand ID (UUID)
 * - limit: Max results to return (default: 100, max: 100)
 * - offset: Skip N results (default: 0)
 *
 * Auth: Bearer SERVICE_API_KEY (for Bolt) OR Supabase session (for FlashFlow UI)
 *
 * Response:
 * {
 *   ok: true,
 *   data: {
 *     products: [...],
 *     total: number,
 *     limit: number,
 *     offset: number
 *   }
 * }
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - supports SESSION, API KEY (ff_ak_*), or SERVICE_API_KEY
  const auth = await validateApiAccess(request);
  if (!auth) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }
  const userId = auth.userId;

  // Parse query params
  const { searchParams } = new URL(request.url);
  const brandName = searchParams.get("brand");
  const brandId = searchParams.get("brand_id");
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");

  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 100;
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

  try {
    // Build query with optional filters
    let query = supabaseAdmin
      .from("products")
      .select(`
        *,
        brand_entity:brands(id, name, brand_image_url)
      `, { count: "exact" })
      .eq("user_id", userId);

    // Apply brand filters
    if (brandName) {
      query = query.ilike("brand", brandName);
    }
    if (brandId) {
      query = query.eq("brand_id", brandId);
    }

    // Get total count and paginated data
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error(`[${correlationId}] Error fetching products:`, error);
      return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      data: {
        products: data || [],
        total: count || 0,
        limit,
        offset,
      },
      correlation_id: correlationId,
    });
    response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    return response;
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

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - supports SESSION, API KEY (ff_ak_*), or SERVICE_API_KEY
  const auth = await validateApiAccess(request);
  if (!auth) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }
  const userId = auth.userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON", correlation_id: correlationId },
      { status: 400 }
    );
  }

  const { name, brand, category, category_risk, notes, brand_id, description, link, product_image_url, images } = body as Record<string, unknown>;

  if (typeof name !== "string" || name.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "name is required and must be a non-empty string", correlation_id: correlationId },
      { status: 400 }
    );
  }

  if (typeof brand !== "string" || brand.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "brand is required and must be a non-empty string", correlation_id: correlationId },
      { status: 400 }
    );
  }

  if (typeof category !== "string" || category.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "category is required and must be a non-empty string", correlation_id: correlationId },
      { status: 400 }
    );
  }

  const insertPayload: Record<string, unknown> = {
    name: name.trim(),
    brand: brand.trim(),
    category: category.trim(),
    user_id: userId,  // Set user_id on insert
  };
  if (category_risk !== undefined) insertPayload.category_risk = category_risk;
  if (notes !== undefined) insertPayload.notes = notes;
  if (brand_id !== undefined) insertPayload.brand_id = brand_id;
  if (description !== undefined) insertPayload.description = description;
  if (link !== undefined) insertPayload.primary_link = link;
  if (product_image_url !== undefined) insertPayload.product_image_url = product_image_url;
  if (images !== undefined) insertPayload.images = images;

  const { data, error } = await supabaseAdmin
    .from("products")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error("POST /api/products Supabase error:", error);
    console.error("POST /api/products insert payload:", {
      name,
      brand,
      category_risk,
      notes,
    });

    return NextResponse.json(
      { ok: false, error: error.message, correlation_id: correlationId },
      { status: 500 }
    );
  }

  auditLogAsync({
    correlation_id: correlationId,
    event_type: "PRODUCT_CREATED",
    entity_type: "PRODUCT",
    entity_id: data.id,
    actor: userId,
    summary: `Product "${name}" created`,
    details: { name, brand, category_risk },
  });

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}
