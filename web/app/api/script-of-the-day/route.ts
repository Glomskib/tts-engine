/**
 * Script of the Day API
 * GET  — Retrieve today's script (or most recent)
 * POST — Generate a new script of the day
 *
 * Smart selection based on:
 *  a. Product rotation score (needs content most)
 *  b. Winner patterns (best-performing hook style)
 *  c. Brand quotas (which brand is falling behind)
 *  d. Recency (what hasn't been filmed recently)
 *  e. Winner remix — if a winner exists in the product category, remix its hook
 */

import { NextRequest, NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  generateCorrelationId,
  createApiErrorResponse,
} from "@/lib/api-errors";

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
    // 4. Winner remix — find winner in same category/brand
    // -----------------------------------------------------------------------
    let winnerRemix: { hook: string; id: string; view_count: number } | null = null;
    const { data: winners } = await supabaseAdmin
      .from("winners_bank")
      .select("id, hook, product_category, view_count")
      .eq("user_id", userId)
      .order("view_count", { ascending: false })
      .limit(100);

    if (winners && winners.length > 0) {
      // Try category match first, then any winner
      const categoryMatch = winners.find(
        (w) =>
          w.hook &&
          w.product_category &&
          chosenProduct.category &&
          w.product_category.toLowerCase() === chosenProduct.category.toLowerCase(),
      );
      const bestWinner = categoryMatch || winners[0];
      if (bestWinner?.hook) {
        winnerRemix = {
          hook: bestWinner.hook,
          id: bestWinner.id,
          view_count: bestWinner.view_count || 0,
        };
      }
    }

    // -----------------------------------------------------------------------
    // 5. Fetch latest winner patterns for style guidance
    // -----------------------------------------------------------------------
    const { data: patternAnalysis } = await supabaseAdmin
      .from("winner_pattern_analyses")
      .select("winning_formula, top_hook_types, top_formats")
      .eq("user_id", userId)
      .order("analyzed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // -----------------------------------------------------------------------
    // 6. Build creative direction incorporating all signals
    // -----------------------------------------------------------------------
    const hookGuidance = patternAnalysis?.top_hook_types
      ? (() => {
          try {
            const hooks = typeof patternAnalysis.top_hook_types === "string"
              ? JSON.parse(patternAnalysis.top_hook_types)
              : patternAnalysis.top_hook_types;
            if (Array.isArray(hooks) && hooks.length > 0) {
              return `Best-performing hook styles: ${hooks.slice(0, 3).map((h: { type?: string }) => h.type).join(", ")}.`;
            }
          } catch { /* ignore */ }
          return "";
        })()
      : "";

    const winnerDirective = winnerRemix
      ? `IMPORTANT: Remix this proven winner hook for the current product: "${winnerRemix.hook}". Adapt it to ${chosenProduct.name} while keeping the same energy and structure.`
      : "";

    const formulaNote = patternAnalysis?.winning_formula
      ? `Winning formula from analysis: ${patternAnalysis.winning_formula}`
      : "";

    const creativeDirection = [
      `Generate the BEST possible script for "${chosenProduct.name}" (${chosenProduct.brand || "unbranded"}).`,
      `This is the Script of the Day — it should be the single most filmable, high-potential script.`,
      hookGuidance,
      winnerDirective,
      formulaNote,
      `Include specific filming tips: props needed, location suggestion, and key delivery notes.`,
      `The hook must stop the scroll in the first 2 seconds.`,
    ]
      .filter(Boolean)
      .join(" ");

    // -----------------------------------------------------------------------
    // 7. Call the AI generation endpoint internally
    // -----------------------------------------------------------------------
    const baseUrl = new URL(request.url).origin;

    const genResponse = await fetch(`${baseUrl}/api/ai/generate-skit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") || "",
        authorization: request.headers.get("authorization") || "",
      },
      body: JSON.stringify({
        product_id: chosenProduct.id,
        risk_tier: "BALANCED",
        persona: "NONE",
        intensity: 40,
        variation_count: 3,
        content_format: "pov_story",
        hook_strength: "strong",
        target_duration: "standard",
        creative_direction: creativeDirection,
        use_winners_intelligence: true,
      }),
    });

    if (!genResponse.ok) {
      const errText = await genResponse.text().catch(() => "Unknown error");
      return createApiErrorResponse(
        "AI_ERROR",
        `Script generation failed: ${errText.slice(0, 200)}`,
        500,
        correlationId,
      );
    }

    const genResult = await genResponse.json();
    const skit = genResult?.data?.variations?.[0]?.skit || genResult?.data?.skit;
    const aiScore = genResult?.data?.variations?.[0]?.ai_score || genResult?.data?.ai_score;

    if (!skit) {
      return createApiErrorResponse(
        "AI_ERROR",
        "AI returned no script data",
        500,
        correlationId,
      );
    }

    // -----------------------------------------------------------------------
    // 8. Build filming tips
    // -----------------------------------------------------------------------
    const filmingTips = buildFilmingTips(skit, chosenProduct);

    // -----------------------------------------------------------------------
    // 9. Determine best posting account
    // -----------------------------------------------------------------------
    const { data: accounts } = await supabaseAdmin
      .from("tiktok_accounts")
      .select("id, name, category_focus")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(5);

    const suggestedAccount = accounts?.[0]
      ? { id: accounts[0].id, account_name: accounts[0].name }
      : null;

    // -----------------------------------------------------------------------
    // 10. Save to database
    // -----------------------------------------------------------------------
    const scriptDate = new Date().toISOString().slice(0, 10);

    const record = {
      user_id: userId,
      script_date: scriptDate,
      product_id: chosenProduct.id,
      product_name: chosenProduct.name,
      product_brand: chosenProduct.brand || null,
      product_category: chosenProduct.category || null,
      hook: skit.hook_line || "",
      full_script: JSON.stringify(skit),
      filming_tips: JSON.stringify(filmingTips),
      selection_reasons: JSON.stringify(chosenProduct.score_reasons),
      compound_score: chosenProduct.compound_score,
      ai_score: aiScore ? JSON.stringify(aiScore) : null,
      winner_remix_id: winnerRemix?.id || null,
      winner_remix_hook: winnerRemix?.hook || null,
      suggested_account_id: suggestedAccount?.id || null,
      suggested_account_name: suggestedAccount?.account_name || null,
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

// ---------------------------------------------------------------------------
// Helper: build filming tips from skit data
// ---------------------------------------------------------------------------
function buildFilmingTips(
  skit: Record<string, unknown>,
  product: { name: string; brand?: string | null; category?: string | null },
) {
  const beats = (skit.beats as Array<{ action?: string; dialogue?: string }>) || [];
  const props: string[] = [`The product: ${product.name}`];
  const locations: string[] = [];

  for (const beat of beats) {
    const action = (beat.action || "").toLowerCase();
    if (action.includes("kitchen") || action.includes("cook")) locations.push("Kitchen");
    if (action.includes("bathroom") || action.includes("mirror")) locations.push("Bathroom");
    if (action.includes("office") || action.includes("desk")) locations.push("Office/Desk");
    if (action.includes("outside") || action.includes("walk")) locations.push("Outdoors");
    if (action.includes("phone")) props.push("Phone/ring light");
    if (action.includes("box") || action.includes("unbox")) props.push("Product packaging");
  }

  if (locations.length === 0) locations.push("Clean, well-lit space");

  return {
    props: [...new Set(props)],
    locations: [...new Set(locations)],
    lighting: "Natural light preferred, or ring light for close-ups",
    audio: "Quiet room, speak clearly toward camera",
    duration_estimate: beats.length <= 3 ? "15-30 seconds" : "30-60 seconds",
    key_delivery_notes: [
      "Nail the hook in the first 2 seconds — energy matters",
      "Look directly at camera for authenticity",
      "Show the product within the first 5 seconds",
      "End with a clear CTA",
    ],
    checklist: [
      "Product charged/ready to demo",
      "Phone charged, storage free",
      "Good lighting set up",
      "Background clean/on-brand",
      "Script rehearsed once",
      "Ring light positioned",
    ],
  };
}
