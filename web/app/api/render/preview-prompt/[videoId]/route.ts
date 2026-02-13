import { NextResponse } from "next/server";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildRunwayPrompt } from "@/lib/runway-prompt-builder";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/render/preview-prompt/[videoId]
 *
 * Returns the Runway prompt that WOULD be generated for this video,
 * without spending any Runway credits. For review before approving render.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
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

  const { videoId } = await params;

  if (!videoId || videoId.length < 10) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Invalid videoId",
      400,
      correlationId
    );
  }

  // Fetch video with product and skit data
  const { data: video, error: videoErr } = await supabaseAdmin
    .from("videos")
    .select("id, product_id, script_locked_text, recording_status")
    .eq("id", videoId)
    .single();

  if (videoErr || !video) {
    return createApiErrorResponse(
      "NOT_FOUND",
      "Video not found",
      404,
      correlationId
    );
  }

  if (!video.product_id) {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Video has no product_id",
      400,
      correlationId
    );
  }

  // Fetch product
  const { data: product, error: productErr } = await supabaseAdmin
    .from("products")
    .select(
      "id, name, brand, category, product_image_url, notes, pain_points, product_display_name"
    )
    .eq("id", video.product_id)
    .single();

  if (productErr || !product) {
    return createApiErrorResponse(
      "NOT_FOUND",
      "Product not found",
      404,
      correlationId
    );
  }

  // Try to find a linked skit for richer context
  let skitScript: string | null = null;
  let onScreenText: string | null = null;

  const { data: skit } = await supabaseAdmin
    .from("saved_skits")
    .select("skit_data")
    .eq("video_id", videoId)
    .limit(1)
    .maybeSingle();

  if (skit?.skit_data) {
    const sd = skit.skit_data as {
      hook_line?: string;
      beats?: Array<{
        dialogue?: string;
        action?: string;
        on_screen_text?: string;
      }>;
      cta_line?: string;
      cta_overlay?: string;
    };

    const dialogueLines: string[] = [];
    const ostLines: string[] = [];

    if (sd.hook_line) dialogueLines.push(sd.hook_line);
    if (sd.beats) {
      for (const beat of sd.beats) {
        if (beat.dialogue) dialogueLines.push(beat.dialogue);
        if (beat.on_screen_text) ostLines.push(beat.on_screen_text);
      }
    }
    if (sd.cta_line) dialogueLines.push(sd.cta_line);
    if (sd.cta_overlay) ostLines.push(sd.cta_overlay);

    skitScript = dialogueLines.join(" ") || null;
    onScreenText = ostLines.join(" | ") || null;
  }

  // Use script_locked_text as fallback
  const scriptText = skitScript || video.script_locked_text || null;

  // Build the prompt
  const result = await buildRunwayPrompt({
    productName: product.product_display_name || product.name,
    brand: product.brand,
    productImageUrl: product.product_image_url,
    productDescription: product.notes || (product.pain_points as string) || null,
    category: product.category,
    scriptText,
    onScreenText,
  });

  const response = NextResponse.json({
    ok: true,
    videoId,
    productName: product.name,
    brand: product.brand,
    category: product.category,
    hasProductImage: !!product.product_image_url,
    hasScript: !!scriptText,
    hasOnScreenText: !!onScreenText,
    prompt: result.prompt,
    charCount: result.charCount,
    setting: result.setting,
    action: result.action,
    aiGenerated: result.aiGenerated,
    model: result.model || null,
    recording_status: video.recording_status,
    correlation_id: correlationId,
  });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}
