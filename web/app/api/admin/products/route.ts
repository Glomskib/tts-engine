import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const VALID_CATEGORIES = ["supplements", "beauty", "fitness", "health", "other"];

/**
 * GET /api/admin/products
 *
 * Returns all products, optionally filtered by brand.
 * Query params:
 * - brand: string (optional) - Filter by brand name
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

  const { searchParams } = new URL(request.url);
  const brand = searchParams.get("brand");

  let query = supabaseAdmin
    .from("products")
    .select("*")
    .order("brand", { ascending: true })
    .order("name", { ascending: true });

  if (brand) {
    query = query.eq("brand", brand);
  }

  const { data, error } = await query;

  if (error) {
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, data });
}

/**
 * POST /api/admin/products
 *
 * Creates a new product under an existing brand.
 *
 * Request body:
 * - name: string (required) - Product name
 * - brand: string (required) - Brand name (must exist)
 * - category: string (required) - One of: supplements, beauty, fitness, health, other
 * - primary_link: string (optional) - Product URL
 * - notes: string (optional) - Additional notes
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

  const { name, brand, category, primary_link, notes } = body as {
    name?: string;
    brand?: string;
    category?: string;
    primary_link?: string;
    notes?: string;
  };

  // Validate name
  if (!name || typeof name !== "string" || name.trim() === "") {
    return createApiErrorResponse("BAD_REQUEST", "Product name is required", 400, correlationId);
  }

  // Validate brand
  if (!brand || typeof brand !== "string" || brand.trim() === "") {
    return createApiErrorResponse("BAD_REQUEST", "Brand is required", 400, correlationId);
  }

  // Validate category
  if (!category || typeof category !== "string" || !VALID_CATEGORIES.includes(category.trim().toLowerCase())) {
    return createApiErrorResponse("BAD_REQUEST", `Category must be one of: ${VALID_CATEGORIES.join(", ")}`, 400, correlationId);
  }

  const brandName = brand.trim();
  const productName = name.trim();
  const categoryValue = category.trim().toLowerCase();

  // Verify brand exists (there should be at least one product with this brand)
  const { data: existingBrandProducts, error: brandCheckError } = await supabaseAdmin
    .from("products")
    .select("id")
    .eq("brand", brandName)
    .limit(1);

  if (brandCheckError) {
    return createApiErrorResponse("DB_ERROR", brandCheckError.message, 500, correlationId);
  }

  if (!existingBrandProducts || existingBrandProducts.length === 0) {
    return createApiErrorResponse("NOT_FOUND", `Brand "${brandName}" does not exist. Create the brand first.`, 404, correlationId);
  }

  // Check for duplicate product name under this brand
  const { data: existingProduct, error: dupCheckError } = await supabaseAdmin
    .from("products")
    .select("id")
    .eq("brand", brandName)
    .ilike("name", productName)
    .limit(1);

  if (dupCheckError) {
    return createApiErrorResponse("DB_ERROR", dupCheckError.message, 500, correlationId);
  }

  if (existingProduct && existingProduct.length > 0) {
    return createApiErrorResponse("CONFLICT", `Product "${productName}" already exists under brand "${brandName}"`, 409, correlationId);
  }

  // Create the product
  const insertPayload: Record<string, unknown> = {
    name: productName,
    brand: brandName,
    category: categoryValue,
  };

  if (primary_link && typeof primary_link === "string" && primary_link.trim()) {
    insertPayload.primary_link = primary_link.trim();
  }

  if (notes && typeof notes === "string" && notes.trim()) {
    insertPayload.notes = notes.trim();
  }

  const { data: product, error: insertError } = await supabaseAdmin
    .from("products")
    .insert(insertPayload)
    .select()
    .single();

  if (insertError) {
    console.error("POST /api/admin/products Supabase error:", insertError);
    return createApiErrorResponse("DB_ERROR", insertError.message, 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: product,
    correlation_id: correlationId,
  });
}
