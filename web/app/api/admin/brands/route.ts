import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/admin/brands
 *
 * Returns all unique brands from the products table.
 */
export async function GET(request: Request) {
  const correlationId = generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Not authenticated", 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from("products")
    .select("brand")
    .order("brand", { ascending: true });

  if (error) {
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  // Extract unique brands
  const brands = Array.from(new Set(data.map((p) => p.brand))).filter(Boolean);

  return NextResponse.json({ ok: true, data: brands });
}

/**
 * POST /api/admin/brands
 *
 * Creates a new brand by creating a placeholder product with that brand.
 * Returns the created product (which establishes the brand).
 *
 * Request body:
 * - name: string (required) - The brand name
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Not authenticated", 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  const { name } = body as { name?: string };

  // Validate brand name
  if (!name || typeof name !== "string" || name.trim() === "") {
    return createApiErrorResponse("BAD_REQUEST", "Brand name is required", 400, correlationId);
  }

  const brandName = name.trim();

  // Check if brand already exists
  const { data: existingProducts, error: checkError } = await supabaseAdmin
    .from("products")
    .select("brand")
    .ilike("brand", brandName)
    .limit(1);

  if (checkError) {
    return createApiErrorResponse("DB_ERROR", checkError.message, 500, correlationId);
  }

  if (existingProducts && existingProducts.length > 0) {
    return createApiErrorResponse("CONFLICT", `Brand "${brandName}" already exists`, 409, correlationId);
  }

  // Create a placeholder product to establish the brand
  const { data: product, error: insertError } = await supabaseAdmin
    .from("products")
    .insert({
      name: `${brandName} - Default Product`,
      brand: brandName,
      category: "supplements",
    })
    .select()
    .single();

  if (insertError) {
    console.error("POST /api/admin/brands Supabase error:", insertError);
    return createApiErrorResponse("DB_ERROR", insertError.message, 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: {
      brand: brandName,
      placeholder_product: product,
    },
    correlation_id: correlationId,
  });
}
