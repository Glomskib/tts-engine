/**
 * Script of the Day API
 * GET  — Retrieve today's script (or most recent)
 * POST — Generate a new script of the day (uses unified generator)
 *
 * Smart selection based on:
 *  a. Product rotation score (needs content most)
 *  b. Winner patterns (via unified generator)
 *  c. Brand quotas (which brand is falling behind)
 *  d. Recency (what hasn't been filmed recently)
 */

import { NextRequest, NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  generateCorrelationId,
  createApiErrorResponse,
} from "@/lib/api-errors";
import { generateUnifiedScript } from "@/lib/unified-script-generator";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET — Return today's script (or most recent)
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId,
    );
  }

  const userId = authContext.user.id;
  const dateParam = request.nextUrl.searchParams.get("date");
  const historyParam = request.nextUrl.searchParams.get("history");

  // If history=true, return last 14 days
  if (historyParam === "true") {
    const { data, error } = await supabaseAdmin
      .from("script_of_the_day")
      .select("*")
      .eq("user_id", userId)
      .order("script_date", { ascending: false })
      .limit(14);

    if (error) {
      return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
    }

    const res = NextResponse.json({ ok: true, data: data || [], correlation_id: correlationId });
    res.headers.set("x-correlation-id", correlationId);
    return res;
  }

  // Single-day lookup
  const targetDate = dateParam || new Date().toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from("script_of_the_day")
    .select("*")
    .eq("user_id", userId)
    .eq("script_date", targetDate)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  const res = NextResponse.json({
    ok: true,
    data: data || null,
    correlation_id: correlationId,
  });
  res.headers.set("x-correlation-id", correlationId);
  return res;
}

// ---------------------------------------------------------------------------
// POST — Generate a new Script of the Day
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId,
    );
  }

  const userId = authContext.user.id;

  try {
    const body = await request.json();

    // -----------------------------------------------------------------------
    // Handle status update action (e.g., "accepted" after adding to pipeline)
    // -----------------------------------------------------------------------
    if (body.action === "update_status" && body.id && body.status) {
      const { error: updateError } = await supabaseAdmin
        .from("script_of_the_day")
        .update({ status: body.status })
        .eq("id", body.id)
        .eq("user_id", userId);

      if (updateError) {
        return createApiErrorResponse("DB_ERROR", updateError.message, 500, correlationId);
      }

      const res = NextResponse.json({ ok: true, correlation_id: correlationId });
      res.headers.set("x-correlation-id", correlationId);
      return res;
    }

    // -----------------------------------------------------------------------
    // 1. Fetch products sorted by rotation need
    // -----------------------------------------------------------------------
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id, name, brand, category, rotation_score, last_content_at, content_count_7d, trending_boost")
      .eq("user_id", userId)
      .order("rotation_score", { ascending: false });

    if (!products || products.length === 0) {
      return createApiErrorResponse(
        "NOT_FOUND",
        "No products found. Add products first.",
        404,
        correlationId,
      );
    }

    // -----------------------------------------------------------------------
    // 2. Fetch brand video counts for quota balancing
    // -----------------------------------------------------------------------
    const { data: videos7d } = await supabaseAdmin
      .from("videos")
      .select("id, product_id")
      .eq("user_id", userId)
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());

    const brandVideoCounts: Record<string, number> = {};
    const productVideoIds = new Set<string>();
    for (const v of videos7d || []) {
      if (v.product_id) productVideoIds.add(v.product_id);
    }
    for (const p of products) {
      const brand = p.brand || "Unbranded";
      const count = (videos7d || []).filter((v) => {
        const match = products.find((pp) => pp.id === v.product_id);
        return match && match.brand === brand;
      }).length;
      brandVideoCounts[brand] = count;
    }

    // -----------------------------------------------------------------------
    // 3. Score each product: rotation + brand deficit + recency
    // -----------------------------------------------------------------------
    const avgBrandCount =
      Object.values(brandVideoCounts).length > 0
        ? Object.values(brandVideoCounts).reduce((a, b) => a + b, 0) /
          Object.values(brandVideoCounts).length
        : 0;

    type ScoredProduct = (typeof products)[0] & { compound_score: number; score_reasons: string[] };
    const scored: ScoredProduct[] = products.map((p) => {
      const reasons: string[] = [];
      let score = 0;

      // Rotation score (0-100, higher = needs more content)
      const rotation = Number(p.rotation_score) || 50;
      score += rotation * 0.4;
      if (rotation >= 70) reasons.push(`High rotation need (${rotation})`);

      // Brand deficit bonus
      const brand = p.brand || "Unbranded";
      const brandCount = brandVideoCounts[brand] || 0;
      const brandDeficit = Math.max(0, avgBrandCount - brandCount);
      score += brandDeficit * 10;
      if (brandDeficit > 0) reasons.push(`Brand "${brand}" is ${brandDeficit.toFixed(0)} below avg`);

      // Recency: days since last content
      if (p.last_content_at) {
        const daysSince = (Date.now() - new Date(p.last_content_at).getTime()) / 86400000;
        score += Math.min(daysSince * 2, 30);
        if (daysSince > 5) reasons.push(`${Math.floor(daysSince)}d since last content`);
      } else {
        score += 30;
        reasons.push("Never filmed before");
      }

      // Trending boost
      if (p.trending_boost) {
        score += 15;
        reasons.push("Currently trending");
      }

      return { ...p, compound_score: score, score_reasons: reasons };
    });

    scored.sort((a, b) => b.compound_score - a.compound_score);
    const chosenProduct = scored[0];

    // -----------------------------------------------------------------------
    // 4. Pick a random audience persona (if available)
    // -----------------------------------------------------------------------
    const { data: personas } = await supabaseAdmin
      .from("audience_personas")
      .select("id")
      .eq("user_id", userId)
      .limit(50);

    const chosenPersonaId = personas && personas.length > 0
      ? personas[Math.floor(Math.random() * personas.length)].id
      : undefined;

    // -----------------------------------------------------------------------
    // 5. Generate via unified script generator
    // -----------------------------------------------------------------------
    const result = await generateUnifiedScript({
      productId: chosenProduct.id,
      productName: chosenProduct.name,
      productBrand: chosenProduct.brand,
      productCategory: chosenProduct.category,
      userId,
      audiencePersonaId: chosenPersonaId,
      callerContext: "other",
    });

    // -----------------------------------------------------------------------
    // 6. Save to database
    // -----------------------------------------------------------------------
    const scriptDate = new Date().toISOString().slice(0, 10);
    const fullScript = {
      hook: result.hook,
      setup: result.setup,
      body: result.body,
      cta: result.cta,
      on_screen_text: result.onScreenText,
      filming_notes: result.filmingNotes,
      persona: result.persona,
      sales_approach: result.salesApproach,
      estimated_length: result.estimatedLength,
    };

    const record = {
      user_id: userId,
      script_date: scriptDate,
      product_id: chosenProduct.id,
      product_name: chosenProduct.name,
      product_brand: chosenProduct.brand || null,
      product_category: chosenProduct.category || null,
      hook: result.hook,
      full_script: fullScript,
      filming_tips: JSON.stringify({
        props: [chosenProduct.name],
        lighting: "Natural light preferred",
        duration_estimate: result.estimatedLength,
        key_delivery_notes: result.editorNotes,
      }),
      selection_reasons: JSON.stringify(chosenProduct.score_reasons),
      compound_score: chosenProduct.compound_score,
      status: "generated",
    };

    const { data: saved, error: saveError } = await supabaseAdmin
      .from("script_of_the_day")
      .insert(record)
      .select()
      .single();

    if (saveError) {
      return createApiErrorResponse("DB_ERROR", saveError.message, 500, correlationId);
    }

    const res = NextResponse.json({
      ok: true,
      data: saved,
      correlation_id: correlationId,
    });
    res.headers.set("x-correlation-id", correlationId);
    return res;
  } catch (err) {
    console.error("[script-of-the-day] generation error:", err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Unknown error",
      500,
      correlationId,
    );
  }
}
