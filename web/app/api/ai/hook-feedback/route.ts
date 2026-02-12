import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { enforceRateLimits, extractRateLimitContext } from "@/lib/rate-limit";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

interface HookFeedbackInput {
  brand_name: string;
  product_id?: string;
  hook_text: string;
  rating: -1 | 1; // -1 = ban, 1 = approve
  reason?: string;
}

/**
 * Generate a hash for quick hook lookup
 */
function hashHook(hookText: string): string {
  return crypto
    .createHash("md5")
    .update(hookText.toLowerCase().trim())
    .digest("hex");
}

/**
 * POST /api/ai/hook-feedback
 * Save thumbs up/down feedback for a hook
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Rate limiting check
  const authContext = await getApiAuthContext(request);
  const rateLimitContext = {
    userId: authContext.user?.id ?? null,
    orgId: null,
    ...extractRateLimitContext(request),
  };
  const rateLimitResponse = enforceRateLimits(rateLimitContext, correlationId);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let body: HookFeedbackInput;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  const { brand_name, product_id, hook_text, rating, reason } = body;

  // Validation
  if (!brand_name || typeof brand_name !== "string") {
    return createApiErrorResponse("VALIDATION_ERROR", "brand_name is required", 400, correlationId);
  }

  if (!hook_text || typeof hook_text !== "string") {
    return createApiErrorResponse("VALIDATION_ERROR", "hook_text is required", 400, correlationId);
  }

  if (rating !== -1 && rating !== 1) {
    return createApiErrorResponse("VALIDATION_ERROR", "rating must be -1 (ban) or 1 (approve)", 400, correlationId);
  }

  try {
    const hookHash = hashHook(hook_text);

    // Upsert - update rating if hook already has feedback
    const { data, error } = await supabaseAdmin
      .from("ai_hook_feedback")
      .upsert(
        {
          brand_name,
          product_id: product_id || null,
          hook_text: hook_text.trim(),
          hook_hash: hookHash,
          rating,
          reason: reason || null,
          created_by: authContext.user?.id || "anonymous",
        },
        {
          onConflict: "brand_name,hook_hash",
        }
      )
      .select()
      .single();

    if (error) {
      console.error(`[${correlationId}] Failed to save hook feedback:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to save feedback", 500, correlationId);
    }

    const successResponse = NextResponse.json({
      ok: true,
      data: {
        id: data.id,
        hook_text: data.hook_text,
        rating: data.rating,
        action: rating === -1 ? "banned" : "approved",
      },
      correlation_id: correlationId,
    });
    successResponse.headers.set("x-correlation-id", correlationId);
    return successResponse;
  } catch (error) {
    console.error(`[${correlationId}] Hook feedback error:`, error);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}

/**
 * GET /api/ai/hook-feedback?brand_name=X&product_id=Y&rating=-1
 * Fetch hooks with specific rating (typically banned hooks)
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  // Rate limiting check (lighter limit for GET)
  const authContext = await getApiAuthContext(request);
  const rateLimitContext = {
    userId: authContext.user?.id ?? null,
    orgId: null,
    ...extractRateLimitContext(request),
  };
  const rateLimitResponse = enforceRateLimits(rateLimitContext, correlationId, { userLimit: 30 });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const brandName = searchParams.get("brand_name");
  const productId = searchParams.get("product_id");
  const rating = searchParams.get("rating");

  if (!brandName) {
    return createApiErrorResponse("VALIDATION_ERROR", "brand_name is required", 400, correlationId);
  }

  try {
    let query = supabaseAdmin
      .from("ai_hook_feedback")
      .select("hook_text, rating, reason, created_at")
      .eq("brand_name", brandName);

    // Filter by product if provided
    if (productId) {
      query = query.or(`product_id.eq.${productId},product_id.is.null`);
    }

    // Filter by rating if provided
    if (rating) {
      query = query.eq("rating", parseInt(rating, 10));
    }

    query = query.order("created_at", { ascending: false }).limit(100);

    const { data, error } = await query;

    if (error) {
      console.error(`[${correlationId}] Failed to fetch hook feedback:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch feedback", 500, correlationId);
    }

    const successResponse = NextResponse.json({
      ok: true,
      data: data || [],
      correlation_id: correlationId,
    });
    successResponse.headers.set("x-correlation-id", correlationId);
    return successResponse;
  } catch (error) {
    console.error(`[${correlationId}] Hook feedback fetch error:`, error);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
