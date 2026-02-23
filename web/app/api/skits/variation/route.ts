/**
 * POST /api/skits/variation
 *
 * Creates a single variation of an existing skit — same structure, different
 * execution. Costs 1 credit. Does NOT auto-save; returns the variation for
 * the UI to render inline.
 */

import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { enforceRateLimits } from "@/lib/rate-limit";
import { spendCredits, checkCredits } from "@/lib/credits";
import {
  postProcessSkit,
  validateSkitStructure,
  type RiskTier,
} from "@/lib/ai/skitPostProcess";
import { callAnthropicJSON } from "@/lib/ai/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

// --- Compliance rules (inlined into the variation prompt) ---

const COMPLIANCE_RULES = `CRITICAL COMPLIANCE RULES — NEVER VIOLATE:
1. NEVER use words: cure, treat, heal, diagnose, disease, prescription, clinically
2. NEVER use: guaranteed, guarantee, 100%, always, never (as absolutes)
3. NEVER reference: ADHD, depression, anxiety, pain relief, or any medical conditions
4. NEVER make health claims or promise specific results
5. NEVER "in the style of [real person]" — only use fictional personas
6. Product benefits should be stated as experiences, not medical outcomes
   BAD: "cures your fatigue"
   GOOD: "I actually have energy for my 3pm meetings now"
7. NEVER imitate, reference, or parody any real celebrities, influencers, or public figures`;

// --- Build the variation prompt ---

function buildVariationPrompt(
  skit: Record<string, unknown>,
  productName?: string,
  productBrand?: string,
): string {
  // Serialize the original skit fields for context
  const hookSection = [
    skit.visual_hook && `VISUAL HOOK: "${skit.visual_hook}"`,
    skit.text_on_screen_hook && `TEXT ON SCREEN HOOK: "${skit.text_on_screen_hook}"`,
    skit.verbal_hook && `VERBAL HOOK: "${skit.verbal_hook}"`,
    skit.hook_line && `HOOK LINE: "${skit.hook_line}"`,
  ]
    .filter(Boolean)
    .join("\n");

  const beats = (skit.beats as Array<Record<string, string>>) || [];
  const beatsSection = beats
    .map(
      (b, i) =>
        `  Beat ${i + 1} [${b.t}]: action="${b.action}"${b.dialogue ? ` dialogue="${b.dialogue}"` : ""}${b.on_screen_text ? ` text="${b.on_screen_text}"` : ""}`,
    )
    .join("\n");

  const bRoll = (skit.b_roll as string[]) || [];
  const overlays = (skit.overlays as string[]) || [];

  return `You are a short-form video script variation engine. Create a VARIATION of the script below — same structure, different execution. Return ONLY valid JSON.

=== ORIGINAL SCRIPT ===
${hookSection}
BEATS:
${beatsSection}
CTA: "${skit.cta_line}"
CTA OVERLAY: "${skit.cta_overlay}"
B-ROLL: ${JSON.stringify(bRoll)}
OVERLAYS: ${JSON.stringify(overlays)}

=== VARIATION RULES ===
1. KEEP the same number of beats (${beats.length}) and overall flow
2. REWRITE all dialogue — different word choices, different examples
3. ALTERNATE the hook — same TYPE (question/claim/story) but new specific wording
4. Use a DIFFERENT CTA phrase with the same intent (TikTok Shop affiliate language)
5. Keep on_screen_text fresh — different overlay wording
6. B-roll suggestions should match new dialogue
7. Do NOT just synonym-swap — make it feel like a genuinely different take

=== COMPLIANCE (MANDATORY) ===
${COMPLIANCE_RULES}

=== PRODUCT CONTEXT ===
Product: ${productName || "Unknown product"}${productBrand ? `, Brand: ${productBrand}` : ""}

Return this exact JSON structure (no markdown fences, no explanation):
{
  "hook_line": "string (single-line hook for backwards compat)",
  "visual_hook": "string (what the viewer SEES in first 1-2 seconds)",
  "text_on_screen_hook": "string (bold text overlay in first 1-2 seconds)",
  "verbal_hook": "string (what is SAID aloud in first 1-2 seconds)",
  "beats": [
    { "t": "timestamp like 0:03", "action": "stage direction", "dialogue": "spoken line", "on_screen_text": "overlay text" }
  ],
  "cta_line": "string",
  "cta_overlay": "string",
  "b_roll": ["suggestion 1", "suggestion 2"],
  "overlays": ["overlay 1", "overlay 2"]
}`;
}

// --- POST handler ---

export async function POST(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // 1. Auth
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId,
    );
  }

  // 2. Rate limit
  const rateLimitResp = enforceRateLimits(
    { userId: authContext.user.id },
    correlationId,
  );
  if (rateLimitResp) return rateLimitResp;

  // 3. Parse body
  let body: {
    skit_data: Record<string, unknown>;
    generation_config?: Record<string, unknown>;
    product_name?: string;
    product_brand?: string;
    product_id?: string;
    parent_skit_id?: string;
  };

  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse(
      "BAD_REQUEST",
      "Invalid JSON body",
      400,
      correlationId,
    );
  }

  if (!body.skit_data || !validateSkitStructure(body.skit_data)) {
    return createApiErrorResponse(
      "VALIDATION_ERROR",
      "skit_data is required and must contain beats, cta_line, cta_overlay, b_roll, overlays, and a hook",
      400,
      correlationId,
    );
  }

  // 4. Credit check + spend
  const creditCheck = await checkCredits(
    authContext.user.id,
    authContext.isAdmin,
  );
  if (!creditCheck.hasCredits) {
    return createApiErrorResponse(
      "INSUFFICIENT_CREDITS",
      "No credits remaining",
      402,
      correlationId,
      { remaining: creditCheck.remaining },
    );
  }

  const creditResult = await spendCredits(
    authContext.user.id,
    1,
    "skit_variation",
    "Skit variation (1 credit)",
    authContext.isAdmin,
  );
  if (!creditResult.success) {
    return createApiErrorResponse(
      "INSUFFICIENT_CREDITS",
      creditResult.error || "Failed to deduct credits",
      402,
      correlationId,
    );
  }

  // 5. Build prompt & call AI
  const prompt = buildVariationPrompt(
    body.skit_data,
    body.product_name,
    body.product_brand,
  );

  let parsedSkit: Record<string, unknown>;
  try {
    const { parsed } = await callAnthropicJSON<Record<string, unknown>>(
      prompt,
      {
        model: "claude-haiku-4-5-20251001",
        temperature: 0.8,
        maxTokens: 4096,
        correlationId,
        requestType: "skit_variation",
        agentId: "content-studio-variation",
      },
    );
    parsedSkit = parsed;
  } catch (err) {
    console.error(`[${correlationId}] Variation AI call failed:`, err);
    return createApiErrorResponse(
      "AI_ERROR",
      "Failed to generate variation — please try again",
      502,
      correlationId,
    );
  }

  // 6. Validate AI output
  if (!validateSkitStructure(parsedSkit)) {
    console.error(
      `[${correlationId}] Variation AI returned invalid structure:`,
      JSON.stringify(parsedSkit).slice(0, 500),
    );
    return createApiErrorResponse(
      "AI_PARSE",
      "AI returned an invalid skit structure — please try again",
      502,
      correlationId,
    );
  }

  // 7. Post-process (compliance sanitization + risk scoring)
  const riskTier: RiskTier =
    (body.generation_config?.risk_tier as RiskTier) || "SAFE";
  const processed = postProcessSkit(parsedSkit, riskTier);

  // 8. Return variation (not saved — UI handles save on demand)
  const response = NextResponse.json({
    ok: true,
    data: {
      skit: processed.skit,
      risk_tier_applied: processed.appliedTier,
      risk_score: processed.riskScore,
      risk_flags: processed.riskFlags,
    },
    correlation_id: correlationId,
  });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}
