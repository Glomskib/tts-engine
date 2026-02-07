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

  const winnerId = body.winner_id;
  const targetProductId = body.target_product_id;
  const variations = typeof body.variations === "number" ? Math.min(body.variations, 5) : 3;

  if (!winnerId || typeof winnerId !== "string") {
    return createApiErrorResponse("BAD_REQUEST", "winner_id is required", 400, correlationId);
  }
  if (!targetProductId || typeof targetProductId !== "string") {
    return createApiErrorResponse("BAD_REQUEST", "target_product_id is required", 400, correlationId);
  }

  // Fetch the winner
  const { data: winner, error: winnerError } = await supabaseAdmin
    .from("winners_bank")
    .select("*")
    .eq("id", winnerId)
    .single();

  if (winnerError || !winner) {
    return createApiErrorResponse("NOT_FOUND", "Winner not found", 404, correlationId);
  }

  // Fetch target product
  const { data: product, error: productError } = await supabaseAdmin
    .from("products")
    .select("id, name, brand, category, description, notes, brand_id")
    .eq("id", targetProductId)
    .single();

  if (productError || !product) {
    return createApiErrorResponse("NOT_FOUND", "Product not found", 404, correlationId);
  }

  // Extract patterns from winner
  const winnerPatterns = {
    hook_text: winner.hook_text ?? winner.hook ?? null,
    hook_style: winner.hook_type ?? null,
    angle: winner.ai_analysis?.hook_analysis?.pattern ?? null,
    tone: winner.ai_analysis?.tone ?? null,
    cta_style: winner.ai_analysis?.content_structure?.cta_style ?? null,
    content_format: winner.content_format ?? null,
  };

  // Build creative direction from winner patterns
  const creativeDirection = [
    `PATTERN TRANSFER FROM WINNER:`,
    winnerPatterns.hook_text ? `Hook Reference: "${winnerPatterns.hook_text}"` : null,
    winnerPatterns.hook_style ? `Hook Style: ${winnerPatterns.hook_style}` : null,
    winnerPatterns.angle ? `Angle: ${winnerPatterns.angle}` : null,
    winnerPatterns.tone ? `Tone: ${winnerPatterns.tone}` : null,
    winnerPatterns.cta_style ? `CTA Style: ${winnerPatterns.cta_style}` : null,
    `Use similar patterns but adapt for ${product.name}.`,
  ].filter(Boolean).join("\n");

  // Forward to generate-skit with pattern transfer context
  const appUrl = config.app.url;
  let generateResponse: Response;
  try {
    const cookieHeader = request.headers.get("cookie") ?? "";

    generateResponse = await fetch(`${appUrl}/api/clawbot/generate-skit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": cookieHeader,
        "x-correlation-id": correlationId,
      },
      body: JSON.stringify({
        product_id: targetProductId,
        product_name: product.name,
        brand_name: product.brand,
        risk_tier: "BALANCED",
        persona: "NONE",
        variation_count: variations,
        content_format: winnerPatterns.content_format || "skit",
        creative_direction: creativeDirection,
      }),
    });
  } catch (err) {
    console.error(`[${correlationId}] Failed to call generate-skit:`, err);
    return createApiErrorResponse("AI_ERROR", "Failed to reach skit generation service", 502, correlationId);
  }

  let generateData: Record<string, unknown>;
  try {
    generateData = await generateResponse.json();
  } catch {
    return createApiErrorResponse("AI_ERROR", "Invalid response from skit generation", 502, correlationId);
  }

  // Attach pattern attribution
  const strategyMetadata = generateData.strategy_metadata as Record<string, unknown> | null;
  const enrichedMetadata = {
    ...(strategyMetadata ?? {}),
    source: "generate_like_winner",
    winner_id: winnerId,
    pattern_attribution: winnerPatterns,
  };

  const response = NextResponse.json(
    {
      ...generateData,
      strategy_metadata: enrichedMetadata,
      reference: {
        winner_id: winnerId,
        winner_hook: winnerPatterns.hook_text,
        extracted: winnerPatterns,
      },
      correlation_id: correlationId,
    },
    { status: generateResponse.status }
  );

  response.headers.set("x-correlation-id", correlationId);
  return response;
}
