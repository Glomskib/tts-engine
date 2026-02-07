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
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  // Auth
  const authContext = await getApiAuthContext();
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

  try {
    // Fetch winner patterns and feedback in parallel
    const [winnerPatterns, recentFeedback] = await Promise.all([
      fetchWinnerPatternsForStrategy(authContext.user.id, productCategory),
      fetchRecentFeedback(authContext.user.id),
    ]);

    const strategyRequest: StrategyRequest = {
      product_name: productName,
      product_category: productCategory,
      brand_name: brandName,
      product_context: productContext,
      content_format: contentFormat,
      risk_tier: riskTier,
      winner_patterns: winnerPatterns,
      recent_feedback: recentFeedback,
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
  const appUrl = config.app.url;
  let generateResponse: Response;
  try {
    // Forward cookies for auth propagation
    const cookieHeader = request.headers.get("cookie") ?? "";

    generateResponse = await fetch(`${appUrl}/api/ai/generate-skit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": cookieHeader,
        "x-correlation-id": correlationId,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`[${correlationId}] Failed to call generate-skit:`, err);
    return createApiErrorResponse("AI_ERROR", "Failed to reach skit generation service", 502, correlationId);
  }

  // Parse response from generate-skit
  let generateData: Record<string, unknown>;
  try {
    generateData = await generateResponse.json();
  } catch {
    return createApiErrorResponse("AI_ERROR", "Invalid response from skit generation", 502, correlationId);
  }

  // Attach strategy metadata to response
  const response = NextResponse.json(
    {
      ...generateData,
      strategy_metadata: strategy,
      clawbot_active: clawbotActive,
      correlation_id: correlationId,
    },
    { status: generateResponse.status }
  );

  response.headers.set("x-correlation-id", correlationId);
  return response;
}
