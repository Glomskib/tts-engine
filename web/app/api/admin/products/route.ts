import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
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
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!authContext.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
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
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
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
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!authContext.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
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
    return NextResponse.json(
      { ok: false, error: "Product name is required", error_code: "VALIDATION_ERROR", correlation_id: correlationId },
      { status: 400 }
    );
  }

  // Validate brand
  if (!brand || typeof brand !== "string" || brand.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "Brand is required", error_code: "VALIDATION_ERROR", correlation_id: correlationId },
      { status: 400 }
    );
  }

  // Validate category
  if (!category || typeof category !== "string" || !VALID_CATEGORIES.includes(category.trim().toLowerCase())) {
    return NextResponse.json(
      { ok: false, error: `Category must be one of: ${VALID_CATEGORIES.join(", ")}`, error_code: "VALIDATION_ERROR", correlation_id: correlationId },
      { status: 400 }
    );
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
    return NextResponse.json(
      { ok: false, error: brandCheckError.message, correlation_id: correlationId },
      { status: 500 }
    );
  }

  if (!existingBrandProducts || existingBrandProducts.length === 0) {
    return NextResponse.json(
      { ok: false, error: `Brand "${brandName}" does not exist. Create the brand first.`, error_code: "NOT_FOUND", correlation_id: correlationId },
      { status: 404 }
    );
  }

  // Check for duplicate product name under this brand
  const { data: existingProduct, error: dupCheckError } = await supabaseAdmin
    .from("products")
    .select("id")
    .eq("brand", brandName)
    .ilike("name", productName)
    .limit(1);

  if (dupCheckError) {
    return NextResponse.json(
      { ok: false, error: dupCheckError.message, correlation_id: correlationId },
      { status: 500 }
    );
  }

  if (existingProduct && existingProduct.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Product "${productName}" already exists under brand "${brandName}"`, error_code: "DUPLICATE", correlation_id: correlationId },
      { status: 409 }
    );
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
    return NextResponse.json(
      { ok: false, error: insertError.message, correlation_id: correlationId },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: product,
    correlation_id: correlationId,
  });
}
