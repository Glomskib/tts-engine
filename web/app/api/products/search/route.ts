import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

/**
 * GET /api/products/search?q=toilet+stool
 *
 * Search products by query string (searches name, brand, description)
 *
 * Query params:
 * - q: Search query (required)
 * - limit: Max results to return (default: 50)
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
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - supports SESSION, API KEY (ff_ak_*), or SERVICE_API_KEY
  const auth = await validateApiAccess(request);
  if (!auth) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }
  const userId = auth.userId;

  // Parse query params
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");

  if (!query || query.trim() === "") {
    return createApiErrorResponse("BAD_REQUEST", "Query parameter 'q' is required", 400, correlationId);
  }

  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

  try {
    // Search across name, brand, description, and category fields
    // Using ilike for case-insensitive partial matching
    const searchPattern = `%${query.trim()}%`;

    // Get total count
    const { count, error: countError } = await supabaseAdmin
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .or(`name.ilike.${searchPattern},brand.ilike.${searchPattern},description.ilike.${searchPattern},category.ilike.${searchPattern}`);

    if (countError) {
      console.error(`[${correlationId}] Error counting search results:`, countError);
      return createApiErrorResponse("DB_ERROR", countError.message, 500, correlationId);
    }

    // Get paginated results with brand join
    const { data: products, error } = await supabaseAdmin
      .from("products")
      .select(`
        *,
        brand_entity:brands(id, name, brand_image_url)
      `)
      .eq("user_id", userId)
      .or(`name.ilike.${searchPattern},brand.ilike.${searchPattern},description.ilike.${searchPattern},category.ilike.${searchPattern}`)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error(`[${correlationId}] Error searching products:`, error);
      return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: {
        products: products || [],
        total: count || 0,
        limit,
        offset,
      },
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
