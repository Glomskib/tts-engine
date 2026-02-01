// app/api/ai/generate-image/route.ts - AI B-Roll image generation
import { NextResponse, NextRequest } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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

    // Get Supabase client for database operations
    const supabase = await createServerSupabaseClient();

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

    if (!authContext.isAdmin) {
      // Get user's current credits
      const { data: creditsData, error: creditsError } = await supabase
        .from("user_credits")
        .select("credits")
        .eq("user_id", authContext.user.id)
        .single();

      if (creditsError && creditsError.code !== "PGRST116") {
        console.error("Credits check error:", creditsError);
        return createApiErrorResponse(
          "DB_ERROR",
          "Failed to check credits",
          500,
          correlationId
        );
      }

      const currentCredits = creditsData?.credits || 0;

      if (currentCredits < creditCost) {
        return createApiErrorResponse(
          "INSUFFICIENT_CREDITS",
          `Insufficient credits. Need ${creditCost}, have ${currentCredits}`,
          402,
          correlationId,
          { required: creditCost, available: currentCredits }
        );
      }

      // Deduct credits
      const { error: deductError } = await supabase
        .from("user_credits")
        .update({ credits: currentCredits - creditCost })
        .eq("user_id", authContext.user.id);

      if (deductError) {
        console.error("Credit deduction error:", deductError);
        return createApiErrorResponse(
          "DB_ERROR",
          "Failed to deduct credits",
          500,
          correlationId
        );
      }
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
        const { data: refundData } = await supabase
          .from("user_credits")
          .select("credits")
          .eq("user_id", authContext.user.id)
          .single();

        if (refundData) {
          await supabase
            .from("user_credits")
            .update({ credits: refundData.credits + creditCost })
            .eq("user_id", authContext.user.id);
        }
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
      await supabase
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
