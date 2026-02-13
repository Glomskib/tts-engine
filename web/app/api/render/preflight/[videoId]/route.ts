import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  generateCorrelationId,
  createApiErrorResponse,
} from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

/** Word limits per video duration (seconds). */
const SCRIPT_WORD_LIMITS: Record<number, number> = {
  10: 50,
  15: 70,
  30: 120,
};

/** Status that means "scripted and ready to render". */
const RENDER_READY_STATUS = "NOT_RECORDED";

interface CheckResult {
  pass: boolean;
  detail: string;
}

export interface PreflightResult {
  ready: boolean;
  videoId: string;
  product: string | null;
  checks: {
    hasProductImage: CheckResult;
    imageAccessible: CheckResult;
    hasProductInfo: CheckResult;
    hasScript: CheckResult;
    scriptUnderLimit: CheckResult;
    hasOnScreenText: CheckResult;
    correctStatus: CheckResult;
  };
}

/**
 * Run preflight checks for a video. Exported so batch/route.ts can call it
 * directly without an HTTP round-trip.
 */
export async function runPreflight(videoId: string): Promise<PreflightResult> {
  const checks: PreflightResult["checks"] = {
    hasProductImage: { pass: false, detail: "not checked" },
    imageAccessible: { pass: false, detail: "not checked" },
    hasProductInfo: { pass: false, detail: "not checked" },
    hasScript: { pass: false, detail: "not checked" },
    scriptUnderLimit: { pass: false, detail: "not checked" },
    hasOnScreenText: { pass: false, detail: "not checked" },
    correctStatus: { pass: false, detail: "not checked" },
  };

  // 1. Fetch video
  const { data: video } = await supabaseAdmin
    .from("videos")
    .select("id, product_id, recording_status, script_locked_text")
    .eq("id", videoId)
    .single();

  if (!video) {
    return { ready: false, videoId, product: null, checks };
  }

  // 6. Status check
  if (video.recording_status === RENDER_READY_STATUS) {
    checks.correctStatus = { pass: true, detail: video.recording_status };
  } else {
    checks.correctStatus = {
      pass: false,
      detail: `${video.recording_status} (expected ${RENDER_READY_STATUS})`,
    };
  }

  // 2. Fetch product
  let productName: string | null = null;
  if (video.product_id) {
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("name, brand, product_image_url")
      .eq("id", video.product_id)
      .single();

    if (product) {
      productName = product.name || null;
      const hasBrand = !!(product.brand && product.brand.trim());
      const hasName = !!(product.name && product.name.trim());

      checks.hasProductInfo = {
        pass: hasName && hasBrand,
        detail: hasName && hasBrand
          ? `${product.name} (${product.brand})`
          : `name: ${hasName ? "ok" : "missing"}, brand: ${hasBrand ? "ok" : "missing"}`,
      };

      // 1. Product image check
      if (product.product_image_url && product.product_image_url.trim()) {
        checks.hasProductImage = { pass: true, detail: product.product_image_url };

        // HEAD request to verify accessibility
        try {
          const headResp = await fetch(product.product_image_url, {
            method: "HEAD",
            signal: AbortSignal.timeout(5000),
          });
          if (headResp.ok) {
            checks.imageAccessible = { pass: true, detail: `${headResp.status} OK` };
          } else {
            checks.imageAccessible = { pass: false, detail: `HTTP ${headResp.status}` };
          }
        } catch (err) {
          checks.imageAccessible = {
            pass: false,
            detail: err instanceof Error ? err.message : "timeout or network error",
          };
        }
      } else {
        checks.hasProductImage = { pass: false, detail: "Product image required — Runway cannot generate readable labels without a reference image" };
        checks.imageAccessible = { pass: false, detail: "no URL to check" };
      }
    } else {
      checks.hasProductInfo = { pass: false, detail: "product not found in database" };
      checks.hasProductImage = { pass: false, detail: "Product image required — Runway cannot generate readable labels without a reference image" };
      checks.imageAccessible = { pass: false, detail: "product not found" };
    }
  } else {
    checks.hasProductInfo = { pass: false, detail: "no product_id on video" };
    checks.hasProductImage = { pass: false, detail: "Product image required — Runway cannot generate readable labels without a reference image" };
    checks.imageAccessible = { pass: false, detail: "no product linked" };
  }

  // 3–5. Skit checks: script text, word limit, on_screen_text
  const { data: skit } = await supabaseAdmin
    .from("saved_skits")
    .select("id, skit_data, generation_config")
    .eq("video_id", videoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!skit) {
    // Fall back to script_locked_text on the video itself
    if (video.script_locked_text && video.script_locked_text.trim()) {
      const wordCount = video.script_locked_text.trim().split(/\s+/).length;
      checks.hasScript = { pass: true, detail: `${wordCount} words (from script_locked_text)` };
      checks.scriptUnderLimit = { pass: true, detail: `${wordCount} words (no skit — limit not enforced)` };
    } else {
      checks.hasScript = { pass: false, detail: "no linked skit and no script_locked_text" };
      checks.scriptUnderLimit = { pass: false, detail: "no script to check" };
    }
    checks.hasOnScreenText = { pass: false, detail: "no linked skit" };
  } else {
    const skitData = skit.skit_data as {
      beats?: Array<{
        action?: string;
        dialogue?: string;
        on_screen_text?: string;
      }>;
    } | null;

    const beats = skitData?.beats || [];

    // 3. Script text check — build full script from beat dialogue (spoken words)
    //    Falls back to action text for older skits without dialogue fields
    const allDialogue = beats.map((b) => b.dialogue || "").filter(Boolean);
    const hasDialogue = allDialogue.some((d) => d.trim().length > 0);
    const scriptSource = hasDialogue ? allDialogue : beats.map((b) => b.action || "").filter(Boolean);
    const scriptText = scriptSource.join(" ");
    const wordCount = scriptText ? scriptText.trim().split(/\s+/).length : 0;

    if (wordCount > 0) {
      checks.hasScript = { pass: true, detail: `${wordCount} words` };
    } else if (video.script_locked_text && video.script_locked_text.trim()) {
      const lockedWords = video.script_locked_text.trim().split(/\s+/).length;
      checks.hasScript = { pass: true, detail: `${lockedWords} words (from script_locked_text)` };
    } else {
      checks.hasScript = { pass: false, detail: "skit beats have no action text" };
    }

    // 4. Word limit check
    const genConfig = skit.generation_config as { duration?: number; target_duration?: string } | null;
    let duration = genConfig?.duration || 10;
    if (typeof genConfig?.target_duration === "string") {
      duration = { quick: 10, standard: 15, extended: 30, long: 30 }[genConfig.target_duration] || 10;
    }
    const wordLimit = SCRIPT_WORD_LIMITS[duration] || SCRIPT_WORD_LIMITS[10];
    if (wordCount > 0) {
      checks.scriptUnderLimit = {
        pass: wordCount <= wordLimit,
        detail: `${wordCount}/${wordLimit} words (${duration}s video)`,
      };
    } else {
      checks.scriptUnderLimit = { pass: false, detail: "no script words to check" };
    }

    // 5. On-screen text check
    const beatsWithText = beats.filter(
      (b) => b.on_screen_text && b.on_screen_text.trim()
    ).length;
    if (beats.length === 0) {
      checks.hasOnScreenText = { pass: false, detail: "no beats in skit" };
    } else if (beatsWithText === beats.length) {
      checks.hasOnScreenText = { pass: true, detail: `${beatsWithText}/${beats.length} beats` };
    } else {
      checks.hasOnScreenText = {
        pass: false,
        detail: `${beatsWithText}/${beats.length} beats have text`,
      };
    }
  }

  const ready = Object.values(checks).every((c) => c.pass);

  return { ready, videoId, product: productName, checks };
}

/**
 * GET /api/render/preflight/[videoId]
 *
 * Pre-render validation. Returns structured pass/fail checks so callers
 * know exactly what's missing before spending a Runway credit.
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

  const result = await runPreflight(videoId);

  return NextResponse.json({
    ok: true,
    ...result,
    correlation_id: correlationId,
  });
}
