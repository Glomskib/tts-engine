import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { getUserPlan } from "@/lib/subscription";
import { meetsMinPlan } from "@/lib/plans";

export const runtime = "nodejs";

/**
 * GET /api/clip-index/search
 *
 * Search indexed overlay clips by ingredient, product type, etc.
 *
 * Query params:
 * - q: Free-text search (ingredient name)
 * - ingredient: Filter by ingredient name
 * - product_type: Filter by product type category
 * - limit: Max results (default 20, max 100)
 * - offset: Pagination offset (default 0)
 *
 * Auth: Session or API key required
 * Plan: Creator Pro+ required for results; free users get { locked: true }
 */
export async function GET(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const auth = await validateApiAccess(request);
  if (!auth) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId
    );
  }

  const userId = auth.userId;

  // Plan check — results locked behind Creator Pro+
  const userPlan = await getUserPlan(userId);
  if (!meetsMinPlan(userPlan.plan, "creator_pro")) {
    return NextResponse.json({
      ok: true,
      locked: true,
      teaser_count: 0,
      correlation_id: correlationId,
    });
  }

  // Parse query params
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";
  const ingredient = searchParams.get("ingredient")?.trim() || "";
  const productType = searchParams.get("product_type")?.trim() || "";
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");

  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 20;
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

  try {
    // Build query against ff_clip_index joined to ff_clip_candidates + ff_clip_analysis
    let query = supabaseAdmin
      .from("ff_clip_index")
      .select(
        `
        *,
        candidate:ff_clip_candidates(*),
        analysis:ff_clip_analysis(*)
      `,
        { count: "exact" }
      )
      .order("indexed_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (q) {
      const pattern = `%${q}%`;
      query = query.or(
        `ingredient.ilike.${pattern},title.ilike.${pattern},creator_name.ilike.${pattern}`
      );
    }
    if (ingredient) {
      query = query.ilike("ingredient", `%${ingredient}%`);
    }
    if (productType) {
      query = query.eq("product_type", productType);
    }

    const { data, count, error } = await query;

    // Tables don't exist yet — return empty results gracefully
    if (error) {
      const msg = error.message || "";
      if (
        msg.includes("does not exist") ||
        msg.includes("relation") ||
        error.code === "42P01"
      ) {
        return NextResponse.json({
          ok: true,
          data: { items: [], total: 0, limit, offset },
          correlation_id: correlationId,
        });
      }
      console.error(`[${correlationId}] Clip index search error:`, error);
      return createApiErrorResponse("DB_ERROR", msg, 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: {
        items: data || [],
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
