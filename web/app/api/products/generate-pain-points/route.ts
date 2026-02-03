import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generatePainPoints, type PainPoint } from "@/lib/ai/painPointGenerator";
import { z } from "zod";

export const runtime = "nodejs";

const GeneratePainPointsSchema = z.object({
  product_id: z.string().uuid(),
  save_to_product: z.boolean().optional().default(true),
});

/**
 * POST /api/products/generate-pain-points
 * Generate AI-powered pain points for a product
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  try {
    // Auth check - admin only
    const authContext = await getApiAuthContext();
    if (!authContext.user) {
      return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
    }

    if (!authContext.isAdmin) {
      return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
    }

    // Parse and validate input
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
    }

    const parseResult = GeneratePainPointsSchema.safeParse(body);
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map(e => `${e.path.join(".")}: ${e.message}`);
      return createApiErrorResponse("VALIDATION_ERROR", "Validation failed", 400, correlationId, { errors });
    }

    const { product_id, save_to_product } = parseResult.data;

    // Fetch product
    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("id, name, brand, category, description, notes")
      .eq("id", product_id)
      .single();

    if (productError || !product) {
      return createApiErrorResponse("NOT_FOUND", "Product not found", 404, correlationId);
    }

    // Generate pain points via AI
    const result = await generatePainPoints(
      product.name,
      product.brand,
      product.category,
      product.description,
      product.notes
    );

    // Optionally save to product
    if (save_to_product) {
      const { error: updateError } = await supabaseAdmin
        .from("products")
        .update({ pain_points: result.pain_points })
        .eq("id", product_id);

      if (updateError) {
        console.error("[generate-pain-points] Failed to save to product:", updateError);
        // Don't fail the request, just log
      }
    }

    const response = NextResponse.json({
      ok: true,
      data: {
        pain_points: result.pain_points,
        product_category_insights: result.product_category_insights,
        target_audience_summary: result.target_audience_summary,
        saved: save_to_product,
      },
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (err) {
    console.error("[generate-pain-points] Error:", err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Failed to generate pain points",
      500,
      correlationId
    );
  }
}

/**
 * GET /api/products/generate-pain-points?product_id=xxx
 * Get existing pain points for a product
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const { searchParams } = new URL(request.url);
  const product_id = searchParams.get("product_id");

  if (!product_id) {
    return createApiErrorResponse("BAD_REQUEST", "product_id is required", 400, correlationId);
  }

  // Fetch product pain points
  const { data: product, error } = await supabaseAdmin
    .from("products")
    .select("id, name, pain_points")
    .eq("id", product_id)
    .single();

  if (error || !product) {
    return createApiErrorResponse("NOT_FOUND", "Product not found", 404, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: {
      product_id: product.id,
      product_name: product.name,
      pain_points: (product.pain_points as PainPoint[]) || [],
    },
    correlation_id: correlationId,
  });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}
