// app/api/ai/generate-image/route.ts - AI B-Roll image generation
import { NextResponse, NextRequest } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditLogAsync } from "@/lib/audit";
import { z } from "zod";
import {
  generateImages,
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
import { requireCredits } from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 60;

// Input validation schema
const GenerateImageInputSchema = z.object({
  prompt: z.string().min(3).max(1000),
  model: z.enum(['flux-schnell', 'flux-dev', 'sdxl'] as const).default('flux-schnell'),
  style: z.string().optional(),
  aspect_ratio: z.string().default('1:1'),
  negative_prompt: z.string().max(500).optional(),
  num_outputs: z.number().int().min(1).max(4).default(1),
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

    // Check credits (unless admin)
    const creditCost = getImageCreditCost(input.model, input.num_outputs);

    // Credit check (admins bypass)
    const creditError = await requireCredits(authContext.user.id, authContext.isAdmin);
    if (creditError) {
      return NextResponse.json({
        ok: false,
        error: creditError.error,
        creditsRemaining: creditError.remaining,
        upgrade: true,
        correlation_id: correlationId,
      }, { status: creditError.status });
    }

    // Deduct credits for the image generation (admins bypass)
    let creditsRemaining: number | undefined;
    if (!authContext.isAdmin) {
      // For multiple credits, we need to deduct multiple times or add credits with negative amount
      // Using the add_credits function with negative amount for multi-credit operations
      const { data: deductResult, error: deductError } = await supabaseAdmin.rpc("add_credits", {
        p_user_id: authContext.user.id,
        p_amount: -creditCost,
        p_type: "generation",
        p_description: `Image generation (${input.model}, ${input.num_outputs} images)`,
      });

      if (deductError) {
        console.error("Credit deduction error:", deductError);
        return createApiErrorResponse(
          "DB_ERROR",
          "Failed to deduct credits",
          500,
          correlationId
        );
      }

      const result = deductResult?.[0];
      if (result && result.credits_remaining < 0) {
        // Rollback: credits went negative, add them back
        await supabaseAdmin.rpc("add_credits", {
          p_user_id: authContext.user.id,
          p_amount: creditCost,
          p_type: "refund",
          p_description: "Insufficient credits refund",
        });
        return createApiErrorResponse(
          "INSUFFICIENT_CREDITS",
          `Insufficient credits. Need ${creditCost}, have ${result.credits_remaining + creditCost}`,
          402,
          correlationId,
          { required: creditCost, available: result.credits_remaining + creditCost }
        );
      }

      creditsRemaining = result?.credits_remaining;
    }

    // Generate images
    let imageUrls: string[];
    try {
      imageUrls = await generateImages({
        prompt: input.prompt,
        model: input.model as ImageModelKey,
        style: input.style,
        aspectRatio: input.aspect_ratio,
        negativePrompt: input.negative_prompt,
        numOutputs: input.num_outputs,
      });
    } catch (genError) {
      console.error("Image generation error:", genError);

      // Refund credits on failure (if not admin)
      if (!authContext.isAdmin) {
        await supabaseAdmin.rpc("add_credits", {
          p_user_id: authContext.user.id,
          p_amount: creditCost,
          p_type: "refund",
          p_description: "Image generation failed - credits refunded",
        });
      }

      return createApiErrorResponse(
        "AI_ERROR",
        "Failed to generate images",
        500,
        correlationId,
        { message: genError instanceof Error ? genError.message : "Unknown error" }
      );
    }

    // Store generated images in database (optional, for history)
    const imagesToStore = imageUrls.map((url) => ({
      user_id: authContext.user!.id,
      image_url: url,
      prompt: input.prompt,
      model: input.model,
      style: input.style || null,
      aspect_ratio: input.aspect_ratio,
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
