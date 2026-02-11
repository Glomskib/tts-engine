import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

interface RotationProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  rotation_score: number;
  last_content_at: string | null;
  content_count_7d: number;
  content_count_30d: number;
  trending_boost: boolean;
}

/**
 * Compute rotation data for all products belonging to the authenticated user.
 * rotation_score = how much a product NEEDS new content (0-100).
 *   High (80-100) = needs content urgently
 *   Medium (40-79) = could use content
 *   Low (0-39)     = has plenty of recent content
 */
async function computeRotation(userId: string): Promise<{
  products: RotationProduct[];
  error: string | null;
}> {
  // 1. Fetch all products for user
  const { data: products, error: productsError } = await supabaseAdmin
    .from("products")
    .select("id, name, brand, category, rotation_score, last_content_at, content_count_7d, content_count_30d, trending_boost")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (productsError) {
    return { products: [], error: productsError.message };
  }

  if (!products || products.length === 0) {
    return { products: [], error: null };
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 2. Fetch videos from last 30 days for all user products (one query)
  const { data: recentVideos, error: videosError } = await supabaseAdmin
    .from("videos")
    .select("id, product_id, created_at")
    .eq("user_id", userId)
    .gte("created_at", thirtyDaysAgo.toISOString());

  if (videosError) {
    return { products: [], error: videosError.message };
  }

  // 3. Fetch winners in last 30 days for trending boost
  const { data: recentWinners, error: winnersError } = await supabaseAdmin
    .from("videos")
    .select("id, product_id")
    .eq("user_id", userId)
    .eq("is_winner", true)
    .gte("created_at", thirtyDaysAgo.toISOString());

  if (winnersError) {
    return { products: [], error: winnersError.message };
  }

  // Build lookup maps
  const videosByProduct = new Map<string, { created_at: string }[]>();
  for (const v of recentVideos || []) {
    if (!v.product_id) continue;
    if (!videosByProduct.has(v.product_id)) {
      videosByProduct.set(v.product_id, []);
    }
    videosByProduct.get(v.product_id)!.push({ created_at: v.created_at });
  }

  const winnerProductIds = new Set<string>();
  for (const w of recentWinners || []) {
    if (w.product_id) {
      winnerProductIds.add(w.product_id);
    }
  }

  // 4. Compute rotation scores
  const rotationProducts: RotationProduct[] = [];

  for (const product of products) {
    const productVideos = videosByProduct.get(product.id) || [];

    // Count videos in 7-day and 30-day windows
    const count7d = productVideos.filter(
      (v) => new Date(v.created_at) >= sevenDaysAgo
    ).length;
    const count30d = productVideos.length;

    // Find most recent content
    let lastContentAt: string | null = null;
    if (productVideos.length > 0) {
      const sorted = productVideos
        .map((v) => new Date(v.created_at).getTime())
        .sort((a, b) => b - a);
      lastContentAt = new Date(sorted[0]).toISOString();
    }

    // Calculate days since last content
    let daysSinceLastContent = 999; // default: treat as "never had content"
    if (lastContentAt) {
      daysSinceLastContent = Math.floor(
        (now.getTime() - new Date(lastContentAt).getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    // Rotation score: 100 - (content_count_7d * 15) + (days_since_last_content * 5)
    // Clamped 0-100. Products with no content get score 100.
    let rotationScore: number;
    if (productVideos.length === 0) {
      rotationScore = 100;
    } else {
      rotationScore = 100 - (count7d * 15) + (daysSinceLastContent * 5);
      rotationScore = Math.max(0, Math.min(100, rotationScore));
    }

    const trendingBoost = winnerProductIds.has(product.id);

    rotationProducts.push({
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      rotation_score: rotationScore,
      last_content_at: lastContentAt,
      content_count_7d: count7d,
      content_count_30d: count30d,
      trending_boost: trendingBoost,
    });

    // 5. Update the products table with computed values
    await supabaseAdmin
      .from("products")
      .update({
        rotation_score: rotationScore,
        last_content_at: lastContentAt,
        content_count_7d: count7d,
        content_count_30d: count30d,
        trending_boost: trendingBoost,
      })
      .eq("id", product.id);
  }

  // Sort by rotation_score DESC (most needing content first)
  rotationProducts.sort((a, b) => b.rotation_score - a.rotation_score);

  return { products: rotationProducts, error: null };
}

/**
 * GET /api/products/rotation
 * Return rotation data for all products, sorted by rotation_score DESC.
 */
export async function GET(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId
    );
  }

  const { products, error } = await computeRotation(authContext.user.id);

  if (error) {
    return createApiErrorResponse(
      "DB_ERROR",
      error,
      500,
      correlationId
    );
  }

  const response = NextResponse.json({
    ok: true,
    data: products,
    count: products.length,
    correlation_id: correlationId,
  });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}

/**
 * POST /api/products/rotation
 * Force recalculate rotation scores for all products.
 */
export async function POST(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId
    );
  }

  const { products, error } = await computeRotation(authContext.user.id);

  if (error) {
    return createApiErrorResponse(
      "DB_ERROR",
      error,
      500,
      correlationId
    );
  }

  const response = NextResponse.json({
    ok: true,
    data: products,
    count: products.length,
    refreshed: true,
    correlation_id: correlationId,
  });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}
