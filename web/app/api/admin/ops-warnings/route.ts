import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import crypto from "crypto";

export const runtime = "nodejs";

// --- Types ---

interface Warning {
  code: string;
  severity: "info" | "warn";
  title: string;
  message: string;
  cta?: { label: string; href?: string };
}

// --- Constants ---

const POLICY_RISK_WORDS = [
  "cure", "treat", "heal", "diagnose", "guarantee", "clinically",
  "prescription", "disease", "adhd", "depression", "anxiety", "pain relief",
];

// --- Helpers ---

function hashText(text: string): string {
  return crypto.createHash("md5").update(text.toLowerCase().trim()).digest("hex");
}

function containsPolicyRiskWord(text: string): boolean {
  const lower = text.toLowerCase();
  return POLICY_RISK_WORDS.some((word) => lower.includes(word));
}

// --- Warning Generators ---

async function getHookSuggestionWarnings(id: string): Promise<Warning[]> {
  const warnings: Warning[] = [];

  // Fetch the hook suggestion
  const { data: suggestion, error: suggestionError } = await supabaseAdmin
    .from("hook_suggestions")
    .select("*")
    .eq("id", id)
    .single();

  if (suggestionError || !suggestion) {
    return warnings;
  }

  const hookText = suggestion.hook_text || "";
  const hookType = suggestion.hook_type || "";

  // A) Policy-risk words check
  if (containsPolicyRiskWord(hookText)) {
    warnings.push({
      code: "HOOK_POLICY_RISK",
      severity: "warn",
      title: "Potential policy-risk wording",
      message: "This hook includes wording that may increase rejection risk. Consider softer phrasing.",
      cta: { label: "Review hook in context", href: "/admin/hook-suggestions" },
    });
  }

  // Try to find matching proven hook for performance stats
  const hookHash = hashText(hookText);

  // Get brand_name for lookup
  let brandName = suggestion.brand_name;
  if (!brandName && suggestion.product_id) {
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("brand")
      .eq("id", suggestion.product_id)
      .single();
    brandName = product?.brand || null;
  }

  if (brandName) {
    const { data: provenHook } = await supabaseAdmin
      .from("proven_hooks")
      .select("id, posted_count, underperform_count, winner_count")
      .eq("brand_name", brandName)
      .eq("hook_type", hookType)
      .eq("hook_hash", hookHash)
      .single();

    if (provenHook) {
      const P = provenHook.posted_count || 0;
      const D = provenHook.underperform_count || 0;

      // B) Underperform tendency
      if (P >= 5) {
        const underRate = D / Math.max(P, 1);
        if (underRate >= 0.35) {
          warnings.push({
            code: "HOOK_UNDERPERFORM_TREND",
            severity: "warn",
            title: "High underperform tendency",
            message: `This hook has a high underperform rate: ${D}/${P} (${Math.round(underRate * 100)}%). Consider alternatives.`,
          });
        }
      } else {
        // C) Low data warning
        warnings.push({
          code: "HOOK_LOW_DATA",
          severity: "info",
          title: "Limited posting history",
          message: `Limited posting history (posted_count=${P}). Treat as experimental.`,
        });
      }
    }
  }

  return warnings;
}

async function getProductWarnings(id: string): Promise<Warning[]> {
  const warnings: Warning[] = [];

  // Fetch the product
  const { data: product, error: productError } = await supabaseAdmin
    .from("products")
    .select("id, name, brand")
    .eq("id", id)
    .single();

  if (productError || !product) {
    return warnings;
  }

  // Count recent videos (last 14 days)
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const { count: recentUsage } = await supabaseAdmin
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id)
    .gte("created_at", fourteenDaysAgo.toISOString());

  if (recentUsage && recentUsage >= 10) {
    warnings.push({
      code: "PRODUCT_ACTIVE_IN_PIPELINE",
      severity: "info",
      title: "Product actively in pipeline",
      message: `This product has ${recentUsage} videos in the last 14 days. Editing names/slugs may confuse ops. Prefer notes-only changes unless necessary.`,
      cta: { label: "View audit trail", href: `/admin/audit-log?entity_type=product&entity_id=${id}` },
    });
  }

  return warnings;
}

async function getVideoFeedbackWarnings(id: string): Promise<Warning[]> {
  const warnings: Warning[] = [];

  // Fetch the video with concepts
  const { data: video, error: videoError } = await supabaseAdmin
    .from("videos")
    .select("id, product_id, concepts")
    .eq("id", id)
    .single();

  if (videoError || !video) {
    return warnings;
  }

  // Extract selected hooks from concepts
  const concepts = video.concepts as {
    selected_spoken_hook?: string;
    selected_visual_hook?: string;
    selected_on_screen_hook?: string;
    hook_options?: string[];
  } | null;

  const selectedSpoken = concepts?.selected_spoken_hook || null;
  const selectedVisual = concepts?.selected_visual_hook || null;
  const selectedOnScreen = concepts?.selected_on_screen_hook || null;

  // Check if any hooks are selected
  const hasAnyHook = selectedSpoken || selectedVisual || selectedOnScreen;

  if (!hasAnyHook) {
    // Also check hook_options fallback
    const hookOptions = concepts?.hook_options || [];
    if (hookOptions.length === 0) {
      warnings.push({
        code: "VIDEO_NO_SELECTED_HOOKS",
        severity: "warn",
        title: "No selected hooks found",
        message: "No selected hooks found for this video. Winner/underperform feedback will not update proven hook stats.",
        cta: { label: "View audit trail", href: `/admin/audit-log?entity_type=video&entity_id=${id}` },
      });
      return warnings;
    }
  }

  // If hooks exist, try to resolve proven hook matches
  // Get brand_name for lookup
  let brandName: string | null = null;
  if (video.product_id) {
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("brand")
      .eq("id", video.product_id)
      .single();
    brandName = product?.brand || null;
  }

  if (!brandName) {
    return warnings;
  }

  // Check if any of the hooks match proven_hooks
  const hooksToCheck: { text: string; type: string }[] = [];
  if (selectedSpoken) hooksToCheck.push({ text: selectedSpoken, type: "spoken" });
  if (selectedVisual) hooksToCheck.push({ text: selectedVisual, type: "visual" });
  if (selectedOnScreen) hooksToCheck.push({ text: selectedOnScreen, type: "text" });

  // Fallback to hook_options[0] as spoken
  if (hooksToCheck.length === 0 && concepts?.hook_options?.[0]) {
    hooksToCheck.push({ text: concepts.hook_options[0], type: "spoken" });
  }

  let matchCount = 0;
  for (const hook of hooksToCheck) {
    const hookHash = hashText(hook.text);
    const { data: provenHook } = await supabaseAdmin
      .from("proven_hooks")
      .select("id")
      .eq("brand_name", brandName)
      .eq("hook_type", hook.type)
      .eq("hook_hash", hookHash)
      .single();

    if (provenHook) {
      matchCount++;
    }
  }

  if (hooksToCheck.length > 0 && matchCount === 0) {
    warnings.push({
      code: "VIDEO_FEEDBACK_NO_MATCH",
      severity: "info",
      title: "No proven hook matches",
      message: "Selected hooks did not match any proven hook entries (hash mismatch). Feedback will be recorded but counts may not update.",
    });
  }

  return warnings;
}

// --- Main Handler ---

/**
 * GET /api/admin/ops-warnings
 * Admin-only. Compute soft guardrail warnings for ops actions.
 *
 * Query params:
 *   - type: "hook_suggestion" | "product" | "video_feedback"
 *   - id: entity UUID
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  // Admin-only check
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  if (!authContext.isAdmin) {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const type = searchParams.get("type");
  const id = searchParams.get("id");

  if (!type || !id) {
    const err = apiError("BAD_REQUEST", "Missing required params: type and id", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    let warnings: Warning[] = [];

    switch (type) {
      case "hook_suggestion":
        warnings = await getHookSuggestionWarnings(id);
        break;
      case "product":
        warnings = await getProductWarnings(id);
        break;
      case "video_feedback":
        warnings = await getVideoFeedbackWarnings(id);
        break;
      default:
        const err = apiError("BAD_REQUEST", `Unknown warning type: ${type}`, 400);
        return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data: { warnings },
    });

    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (err) {
    console.error("GET /api/admin/ops-warnings error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}
