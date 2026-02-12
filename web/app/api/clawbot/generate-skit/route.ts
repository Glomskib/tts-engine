import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  generateCorrelationId,
  createApiErrorResponse,
} from "@/lib/api-errors";
import {
  enforceRateLimits,
  extractRateLimitContext,
} from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  generateStrategy,
  fetchWinnerPatternsForStrategy,
  fetchRecentFeedback,
} from "@/lib/clawbot";
import type { StrategyRequest, StrategyResponse } from "@/lib/clawbot";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  // Auth
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Rate limit
  const rlContext = {
    ...extractRateLimitContext(request),
    userId: authContext.user.id,
  };
  const rateLimited = enforceRateLimits(rlContext, correlationId, { userLimit: 5 });
  if (rateLimited) return rateLimited;

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  const productName = String(body.product_name ?? "");
  const brandName = body.brand_name ? String(body.brand_name) : undefined;
  const productId = body.product_id ? String(body.product_id) : undefined;
  const riskTier = body.risk_tier ? String(body.risk_tier) : undefined;
  const contentFormat = body.content_format ? String(body.content_format) : undefined;
  const productContext = body.product_context ? String(body.product_context) : undefined;

  // Fetch product category if we have a product_id
  let productCategory: string | undefined;
  if (productId) {
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("category")
      .eq("id", productId)
      .single();
    productCategory = product?.category ?? undefined;
  }

  // Build strategy context
  let strategy: StrategyResponse | null = null;
  let clawbotActive = false;
  let dataSource: "product" | "global" = "global";
  let feedbackCount = 0;
  let winnerCount = 0;

  try {
    // Fetch winner patterns, feedback, and weekly summary in parallel
    const [winnerPatterns, recentFeedback, latestSummary] = await Promise.all([
      fetchWinnerPatternsForStrategy(authContext.user.id, productCategory),
      fetchRecentFeedback(authContext.user.id),
      supabaseAdmin
        .from("clawbot_summaries")
        .select("summary")
        .eq("user_id", authContext.user.id)
        .eq("summary_type", "weekly")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => data?.summary as Record<string, unknown> | null ?? null),
    ]);

    feedbackCount = recentFeedback?.length ?? 0;
    winnerCount = winnerPatterns?.length ?? 0;

    // Extract product-level patterns if available
    let effectiveSummary = latestSummary;

    if (productId && latestSummary) {
      const productPatterns = (latestSummary.product_patterns as Record<string, unknown>)?.[productId] as
        { winning?: string[]; losing?: string[]; volume?: number } | undefined;

      if (productPatterns && (productPatterns.volume ?? 0) >= 3) {
        dataSource = "product";
        // Merge product-level insights into summary for strategy prompt
        effectiveSummary = {
          ...latestSummary,
          _product_context: {
            product_id: productId,
            winning_angles: productPatterns.winning ?? [],
            losing_angles: productPatterns.losing ?? [],
            volume: productPatterns.volume ?? 0,
          },
        };
      }
    }

    const strategyRequest: StrategyRequest = {
      product_name: productName,
      product_category: productCategory,
      brand_name: brandName,
      product_context: productContext,
      content_format: contentFormat,
      risk_tier: riskTier,
      winner_patterns: winnerPatterns,
      recent_feedback: recentFeedback,
      pattern_summary: effectiveSummary,
    };

    strategy = await generateStrategy(strategyRequest, correlationId);
    if (strategy) {
      clawbotActive = true;
      console.error(`[${correlationId}] Clawbot strategy generated: angle="${strategy.recommended_angle}", risk=${strategy.risk_score}`);

      // Inject strategy hints into the generate-skit request
      if (strategy.suggested_hooks.length > 0 && !body.creative_direction) {
        body.creative_direction = `Strategy angle: ${strategy.recommended_angle}. Tone: ${strategy.tone_direction}. Suggested hooks: ${strategy.suggested_hooks.join(" / ")}`;
      }
    }
  } catch (err) {
    console.error(`[${correlationId}] Clawbot strategy failed (falling back):`, err);
    // Fallback: proceed without strategy
  }

  // Forward to existing generate-skit endpoint via internal HTTP
  // Derive origin from incoming request (works on both localhost and Vercel)
  const appUrl = new URL(request.url).origin;
  let generateResponse: Response;
  try {
    // Forward cookies and authorization for auth propagation
    const cookieHeader = request.headers.get("cookie") ?? "";
    const authHeader = request.headers.get("authorization") ?? "";

    const forwardHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-correlation-id": correlationId,
    };
    if (cookieHeader) forwardHeaders["Cookie"] = cookieHeader;
    if (authHeader) forwardHeaders["Authorization"] = authHeader;

    generateResponse = await fetch(`${appUrl}/api/ai/generate-skit`, {
      method: "POST",
      headers: forwardHeaders,
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`[${correlationId}] Failed to call generate-skit (url=${appUrl}):`, err);
    return createApiErrorResponse("AI_ERROR", "Failed to reach skit generation service", 502, correlationId);
  }

  // Parse response from generate-skit
  let generateData: Record<string, unknown>;
  try {
    generateData = await generateResponse.json();
  } catch {
    return createApiErrorResponse("AI_ERROR", "Invalid response from skit generation", 502, correlationId);
  }

  // Compute strategy confidence based on available data
  let strategyConfidence: { level: "high" | "medium" | "low"; reason: string } | null = null;
  if (strategy) {
    const hasProductData = dataSource === "product";

    if (hasProductData && feedbackCount >= 10 && winnerCount >= 3) {
      strategyConfidence = { level: "high", reason: "Product-level patterns with strong feedback history" };
    } else if (feedbackCount >= 5 || winnerCount >= 2) {
      strategyConfidence = { level: "medium", reason: hasProductData ? "Product-level data with moderate feedback" : "Global patterns with moderate feedback" };
    } else {
      strategyConfidence = { level: "low", reason: feedbackCount === 0 ? "No feedback data yet — strategy is exploratory" : "Limited feedback data" };
    }
  }

  // Attach strategy metadata to response
  const response = NextResponse.json(
    {
      ...generateData,
      strategy_metadata: strategy,
      clawbot_active: clawbotActive,
      data_source: clawbotActive ? dataSource : undefined,
      strategy_confidence: strategyConfidence,
      correlation_id: correlationId,
    },
    { status: generateResponse.status }
  );

  response.headers.set("x-correlation-id", correlationId);
  return response;
}
