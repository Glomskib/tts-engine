import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/admin/brands
 *
 * Returns all unique brands from the products table.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("brand")
    .order("brand", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const { name } = body as { name?: string };

  // Validate brand name
  if (!name || typeof name !== "string" || name.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "Brand name is required", error_code: "VALIDATION_ERROR", correlation_id: correlationId },
      { status: 400 }
    );
  }

  const brandName = name.trim();

  // Check if brand already exists
  const { data: existingProducts, error: checkError } = await supabaseAdmin
    .from("products")
    .select("brand")
    .ilike("brand", brandName)
    .limit(1);

  if (checkError) {
    return NextResponse.json(
      { ok: false, error: checkError.message, correlation_id: correlationId },
      { status: 500 }
    );
  }

  if (existingProducts && existingProducts.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Brand "${brandName}" already exists`, error_code: "DUPLICATE", correlation_id: correlationId },
      { status: 409 }
    );
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
    return NextResponse.json(
      { ok: false, error: insertError.message, correlation_id: correlationId },
      { status: 500 }
    );
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
