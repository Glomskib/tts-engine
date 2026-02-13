import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  generateCorrelationId,
  createApiErrorResponse,
} from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

interface PreflightIssue {
  field: string;
  severity: "error" | "warning";
  message: string;
}

const WORD_LIMITS: Record<number, number> = {
  5: 20,
  10: 30,
  15: 40,
};

/**
 * GET /api/render/preflight/[videoId]
 *
 * Pre-render validation. Checks everything that could waste a Runway credit:
 *   - product_image_url exists AND is accessible (HEAD request)
 *   - skit exists with on_screen_text populated on each beat
 *   - Runway prompt would be under word limit for the target duration
 *   - product name and brand are populated
 *   - beat actions aren't screenplay-length (per-beat word limit)
 *
 * Returns { ready: true/false, issues: [...], prompt_preview: string }
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId
    );
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(videoId)) {
    return createApiErrorResponse(
      "INVALID_UUID",
      "Video ID must be a valid UUID",
      400,
      correlationId
    );
  }

  const issues: PreflightIssue[] = [];

  // 1. Fetch the video
  const { data: video, error: videoErr } = await supabaseAdmin
    .from("videos")
    .select("id, product_id, recording_status, script_locked_text")
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

  // 2. Fetch product
  let productName: string | null = null;
  let brandName: string | null = null;
  let productImageUrl: string | null = null;

  if (!video.product_id) {
    issues.push({
      field: "product_id",
      severity: "error",
      message: "Video has no product_id linked",
    });
  } else {
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("name, brand, product_image_url")
      .eq("id", video.product_id)
      .single();

    if (!product) {
      issues.push({
        field: "product",
        severity: "error",
        message: `Product ${video.product_id} not found in database`,
      });
    } else {
      productName = product.name;
      brandName = product.brand;
      productImageUrl = product.product_image_url;

      if (!productName || !productName.trim()) {
        issues.push({
          field: "product_name",
          severity: "error",
          message: "Product name is empty",
        });
      }

      if (!brandName || !brandName.trim()) {
        issues.push({
          field: "brand",
          severity: "warning",
          message: "Brand name is empty — Runway won't know the brand",
        });
      }

      // 3. Check product image
      if (!productImageUrl || !productImageUrl.trim()) {
        issues.push({
          field: "product_image_url",
          severity: "error",
          message:
            "No product image — Runway will use text-to-video and cannot show the actual product",
        });
      } else {
        // HEAD request to verify image is accessible
        try {
          const headResp = await fetch(productImageUrl, {
            method: "HEAD",
            signal: AbortSignal.timeout(5000),
          });
          if (!headResp.ok) {
            issues.push({
              field: "product_image_url",
              severity: "error",
              message: `Product image returned HTTP ${headResp.status} — URL may be broken or blocked`,
            });
          } else {
            const contentType = headResp.headers.get("content-type") || "";
            if (!contentType.startsWith("image/")) {
              issues.push({
                field: "product_image_url",
                severity: "warning",
                message: `Product image Content-Type is "${contentType}" — may not be a valid image`,
              });
            }
          }
        } catch (err) {
          issues.push({
            field: "product_image_url",
            severity: "error",
            message: `Product image URL unreachable: ${err instanceof Error ? err.message : "timeout or network error"}`,
          });
        }
      }
    }
  }

  // 4. Find linked skit
  const { data: skit } = await supabaseAdmin
    .from("saved_skits")
    .select("id, title, skit_data, generation_config")
    .eq("video_id", videoId)
    .single();

  let promptPreview: string | null = null;
  let promptWordCount = 0;
  const targetDuration = 10; // default

  if (!skit) {
    issues.push({
      field: "skit",
      severity: "error",
      message:
        "No linked skit — re-render requires a UGC_SHORT skit to build the Runway prompt",
    });
  } else {
    const genConfig = skit.generation_config as {
      content_type?: string;
    } | null;
    if (genConfig?.content_type !== "ugc_short") {
      issues.push({
        field: "skit_type",
        severity: "error",
        message: `Skit type is "${genConfig?.content_type || "unknown"}" — only ugc_short supports AI render`,
      });
    }

    const skitData = skit.skit_data as {
      hook_line?: string;
      beats?: Array<{
        t: string;
        action: string;
        dialogue?: string;
        on_screen_text?: string;
      }>;
      cta_line?: string;
      cta_overlay?: string;
    };

    if (!skitData.beats || skitData.beats.length === 0) {
      issues.push({
        field: "beats",
        severity: "error",
        message: "Skit has no beats — nothing to build a Runway prompt from",
      });
    } else {
      // Check each beat
      const beatsWithoutOnScreenText: number[] = [];

      for (let i = 0; i < skitData.beats.length; i++) {
        const beat = skitData.beats[i];

        if (!beat.action || !beat.action.trim()) {
          issues.push({
            field: `beat_${i + 1}_action`,
            severity: "error",
            message: `Beat ${i + 1} has no action text`,
          });
        } else {
          const actionWords = beat.action.split(/\s+/).length;
          if (actionWords > 25) {
            issues.push({
              field: `beat_${i + 1}_action`,
              severity: "warning",
              message: `Beat ${i + 1} action is ${actionWords} words — screenplay-length descriptions confuse Runway (keep under 25 words)`,
            });
          }
        }

        if (!beat.on_screen_text || !beat.on_screen_text.trim()) {
          beatsWithoutOnScreenText.push(i + 1);
        }
      }

      if (beatsWithoutOnScreenText.length > 0) {
        issues.push({
          field: "on_screen_text",
          severity: "warning",
          message: `Beats ${beatsWithoutOnScreenText.join(", ")} have no on_screen_text — text overlays will be missing`,
        });
      }

      // Reconstruct the prompt to check length
      const sceneDescriptions = skitData.beats
        .map((b) => b.action)
        .filter(Boolean)
        .join(" ");

      const pName = productName || "the product";
      promptPreview = `Close-up product-focused vertical video. ${pName} prominently featured in center of frame. Person holding product at chest height, clearly showing label. ${sceneDescriptions} Natural indoor lighting, casual setting. Smartphone-shot feel, 9:16 vertical.`;

      promptWordCount = promptPreview.split(/\s+/).length;
      const wordLimit = WORD_LIMITS[targetDuration] || 30;

      if (promptWordCount > wordLimit) {
        issues.push({
          field: "prompt_length",
          severity: "error",
          message: `Prompt is ${promptWordCount} words — exceeds ${wordLimit}-word limit for ${targetDuration}s video. Runway ignores excess text and produces incoherent results.`,
        });
      }

      // Check total prompt char length (Runway has 2000 char limit)
      if (promptPreview.length > 1500) {
        issues.push({
          field: "prompt_chars",
          severity: "warning",
          message: `Prompt is ${promptPreview.length} characters — approaching Runway's 2000-char limit`,
        });
      }
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");

  return NextResponse.json({
    ok: true,
    data: {
      video_id: videoId,
      ready: !hasErrors,
      issues,
      issue_count: {
        errors: issues.filter((i) => i.severity === "error").length,
        warnings: issues.filter((i) => i.severity === "warning").length,
      },
      prompt_preview: promptPreview,
      prompt_word_count: promptWordCount,
      product: {
        name: productName,
        brand: brandName,
        has_image: !!productImageUrl,
        image_url: productImageUrl,
      },
      skit_id: skit?.id || null,
      target_duration: targetDuration,
    },
    correlation_id: correlationId,
  });
}
