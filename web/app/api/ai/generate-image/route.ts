// app/api/ai/generate-image/route.ts - AI B-Roll image generation
import { NextResponse, NextRequest } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { enforceRateLimits, extractRateLimitContext } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditLogAsync } from "@/lib/audit";
import { z } from "zod";
import {
  generateImages,
  generateImageFromImage,
  getImageCreditCost,
  IMAGE_MODELS,
  IMAGE_STYLES,
  ASPECT_RATIOS,
  type ImageModelKey,
} from "@/lib/replicate";
import {
  generateCorrelationId,
  createApiErrorResponse,
} from "@/lib/api-errors";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEBUG = process.env.DEBUG_AI === "true";

// Valid aspect ratios for Flux models
const VALID_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:5', '5:4', '3:2', '2:3', '4:3', '3:4'];

// Input validation schema
const GenerateImageInputSchema = z.object({
  prompt: z.string().min(3).max(1000),
  model: z.enum(['flux-schnell', 'flux-dev', 'sdxl'] as const).default('flux-schnell'),
  style: z.string().optional(),
  aspect_ratio: z.string().default('9:16'),
  negative_prompt: z.string().max(500).optional(),
  num_outputs: z.number().int().min(1).max(4).default(1),
  // Image-to-image parameters
  source_image: z.string().url().optional(),
  strength: z.number().min(0.1).max(1.0).default(0.7),
  // Free regeneration flag
  free_regen: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();

  try {
    // Authenticate
    const authContext = await getApiAuthContext();
    if (!authContext.user) {
      return createApiErrorResponse(
        "UNAUTHORIZED",
        "Authentication required",
        401,
        correlationId
      );
    }

    // Rate limiting (heavy AI generation - 5 req/min)
    const rateLimitResponse = enforceRateLimits(
      { userId: authContext.user.id, ...extractRateLimitContext(request) },
      correlationId,
      { userLimit: 5 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    // Parse request body
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "Invalid JSON body",
        400,
        correlationId
      );
    }

    // Validate input
    const parsed = GenerateImageInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      return createApiErrorResponse(
        "VALIDATION_ERROR",
        "Invalid input",
        400,
        correlationId,
        { issues: parsed.error.issues }
      );
    }

    const input = parsed.data;

    // Validate and normalize aspect ratio for Flux models
    let normalizedAspectRatio = input.aspect_ratio;
    if (input.model === 'flux-schnell' || input.model === 'flux-dev') {
      if (!VALID_ASPECT_RATIOS.includes(normalizedAspectRatio)) {
        console.warn(`[Generate Image] Invalid aspect ratio "${normalizedAspectRatio}" for Flux, defaulting to 9:16`);
        normalizedAspectRatio = '9:16';
      }
    }

    // Validate prompt is not empty after trimming
    const cleanPrompt = input.prompt.trim();
    if (cleanPrompt.length < 3) {
      return createApiErrorResponse(
        "VALIDATION_ERROR",
        "Prompt must be at least 3 characters after trimming whitespace",
        400,
        correlationId
      );
    }

    // Debug logging
    if (DEBUG) {
      console.log('[Generate Image] Request validated:', {
        prompt: cleanPrompt.substring(0, 50) + '...',
        model: input.model,
        aspectRatio: normalizedAspectRatio,
        style: input.style,
        numOutputs: input.num_outputs,
      });
    }

    // Check credits (unless admin or free regen)
    const creditCost = getImageCreditCost(input.model, input.num_outputs);
    const skipCreditDeduction = input.free_regen === true;

    // Deduct credits for the image generation (admins and free regens bypass)
    let creditsRemaining: number | undefined;
    if (!authContext.isAdmin && !skipCreditDeduction) {
      // Ensure user has credit records (creates them if missing)
      let { data: userCredits } = await supabaseAdmin
        .from("user_credits")
        .select("credits_remaining")
        .eq("user_id", authContext.user.id)
        .single();

      // If no credits row exists, create default records for the user
      if (!userCredits) {

        // Create subscription record (free plan)
        await supabaseAdmin
          .from("user_subscriptions")
          .upsert({
            user_id: authContext.user.id,
            plan_id: "free",
            status: "active",
          }, { onConflict: "user_id" });

        // Create credits record with 5 free credits
        const { data: newCredits } = await supabaseAdmin
          .from("user_credits")
          .upsert({
            user_id: authContext.user.id,
            credits_remaining: 5,
            free_credits_total: 5,
            free_credits_used: 0,
            credits_used_this_period: 0,
            lifetime_credits_used: 0,
          }, { onConflict: "user_id" })
          .select("credits_remaining")
          .single();

        userCredits = newCredits;

        // Log the initial credit grant
        await supabaseAdmin
          .from("credit_transactions")
          .insert({
            user_id: authContext.user.id,
            type: "bonus",
            amount: 5,
            balance_after: 5,
            description: "Welcome bonus - 5 free generations (auto-initialized)",
          });
      }

      // Check if user has enough credits
      const currentCredits = userCredits?.credits_remaining ?? 0;
      if (currentCredits < creditCost) {
        return createApiErrorResponse(
          "INSUFFICIENT_CREDITS",
          `Insufficient credits. Need ${creditCost}, have ${currentCredits}`,
          402,
          correlationId,
          { required: creditCost, available: currentCredits, upgrade: true }
        );
      }

      // Deduct credits using add_credits RPC with negative amount
      const { data: deductResult, error: deductError } = await supabaseAdmin.rpc("add_credits", {
        p_user_id: authContext.user.id,
        p_amount: -creditCost,
        p_type: "generation",
        p_description: `Image generation (${input.model}, ${input.num_outputs} images)`,
      });

      if (deductError) {
        console.error("Credit deduction error:", deductError);
        // Fallback: try direct update if RPC fails
        const { data: fallbackUpdate, error: fallbackError } = await supabaseAdmin
          .from("user_credits")
          .update({
            credits_remaining: currentCredits - creditCost,
          })
          .eq("user_id", authContext.user.id)
          .select("credits_remaining")
          .single();

        if (fallbackError) {
          console.error("Fallback credit deduction also failed:", fallbackError);
          return createApiErrorResponse(
            "DB_ERROR",
            "Failed to deduct credits",
            500,
            correlationId
          );
        }
        creditsRemaining = fallbackUpdate?.credits_remaining;
      } else {
        const result = deductResult?.[0];
        creditsRemaining = result?.credits_remaining;
      }
    }

    // Generate images
    const isImg2Img = !!input.source_image;

    let imageUrls: string[];
    try {
      if (isImg2Img) {
        // Image-to-image generation (uses SDXL)
        imageUrls = await generateImageFromImage({
          prompt: cleanPrompt,
          sourceImageUrl: input.source_image!,
          strength: input.strength,
          style: input.style,
          negativePrompt: input.negative_prompt,
        });
      } else {
        // Text-to-image generation
        imageUrls = await generateImages({
          prompt: cleanPrompt,
          model: input.model as ImageModelKey,
          style: input.style,
          aspectRatio: normalizedAspectRatio,
          negativePrompt: input.negative_prompt,
          numOutputs: input.num_outputs,
        });
      }
    } catch (genError) {
      console.error("[Generate Image] Generation failed:", genError);

      // Refund credits on failure (if not admin and not free regen)
      if (!authContext.isAdmin && !skipCreditDeduction) {
        await supabaseAdmin.rpc("add_credits", {
          p_user_id: authContext.user.id,
          p_amount: creditCost,
          p_type: "refund",
          p_description: "Image generation failed - credits refunded",
        });
      }

      // Provide a user-friendly error message
      let errorMessage = "Failed to generate images";
      let errorDetails = genError instanceof Error ? genError.message : "Unknown error";

      if (errorDetails.includes('REPLICATE_API_TOKEN')) {
        errorMessage = "Image generation service not configured";
        errorDetails = "The Replicate API token is not set up. Please contact support.";
      } else if (errorDetails.includes('authentication') || errorDetails.includes('401')) {
        errorMessage = "Image generation service authentication failed";
        errorDetails = "Invalid API credentials. Please contact support.";
      } else if (errorDetails.includes('rate limit') || errorDetails.includes('429')) {
        errorMessage = "Service temporarily busy";
        errorDetails = "Too many requests. Please wait a moment and try again.";
      }

      return createApiErrorResponse(
        "AI_ERROR",
        errorMessage,
        500,
        correlationId,
        { details: errorDetails }
      );
    }

    // Store generated images in database (optional, for history)
    const imagesToStore = imageUrls.map((url) => ({
      user_id: authContext.user!.id,
      image_url: url,
      prompt: cleanPrompt,
      model: input.model,
      style: input.style || null,
      aspect_ratio: normalizedAspectRatio,
      correlation_id: correlationId,
      created_at: new Date().toISOString(),
    }));

    // Try to store, but don't fail if table doesn't exist
    try {
      await supabaseAdmin
        .from("generated_images")
        .insert(imagesToStore);
    } catch (storeError) {
      console.warn("Could not store generated images:", storeError);
    }

    // Audit log
    auditLogAsync({
      correlation_id: correlationId,
      event_type: "image.generated",
      entity_type: "image",
      entity_id: null,
      actor: authContext.user.id,
      summary: `Generated ${imageUrls.length} image(s) with ${input.model}`,
      details: {
        model: input.model,
        style: input.style,
        aspect_ratio: input.aspect_ratio,
        num_outputs: input.num_outputs,
        credit_cost: creditCost,
        prompt_preview: input.prompt.substring(0, 100),
      },
    });

    // Get style and aspect ratio info for response
    const styleInfo = input.style ? IMAGE_STYLES.find(s => s.value === input.style) : null;
    const aspectInfo = ASPECT_RATIOS.find(ar => ar.value === input.aspect_ratio);

    // Return successful response
    const response = NextResponse.json({
      ok: true,
      images: imageUrls,
      metadata: {
        model: input.model,
        model_name: IMAGE_MODELS[input.model as ImageModelKey].name,
        style: input.style,
        style_name: styleInfo?.label || null,
        aspect_ratio: input.aspect_ratio,
        dimensions: aspectInfo ? { width: aspectInfo.width, height: aspectInfo.height } : null,
        credit_cost: creditCost,
      },
      ...(creditsRemaining !== undefined ? { creditsRemaining } : {}),
      correlation_id: correlationId,
    });

    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (error) {
    console.error("Generate image error:", error);
    return createApiErrorResponse(
      "INTERNAL",
      "Internal server error",
      500,
      correlationId
    );
  }
}

// GET endpoint to return available models, styles, and aspect ratios
export async function GET() {
  return NextResponse.json({
    ok: true,
    models: Object.entries(IMAGE_MODELS).map(([key, model]) => ({
      id: key,
      name: model.name,
      description: model.description,
      credit_cost: model.creditCost,
    })),
    styles: IMAGE_STYLES.map((style) => ({
      id: style.value,
      name: style.label,
      description: style.description,
    })),
    aspect_ratios: ASPECT_RATIOS.map((ratio) => ({
      id: ratio.value,
      label: ratio.label,
      width: ratio.width,
      height: ratio.height,
      platforms: ratio.platforms,
    })),
  });
}
