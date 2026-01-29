import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { auditLogAsync } from "@/lib/audit";
import {
  postProcessSkit,
  validateSkitStructure,
  type RiskTier,
  type Skit,
} from "@/lib/ai/skitPostProcess";
import {
  getSkitTemplate,
  buildTemplatePromptSection,
  validateSkitAgainstTemplate,
  type SkitTemplate,
} from "@/lib/ai/skitTemplates";
import {
  getSkitPreset,
  clampIntensityToPreset,
  buildPresetPromptSection,
  type SkitPreset,
} from "@/lib/ai/skitPresets";
import {
  applySkitBudgetClamp,
  isDebugMode,
  type BudgetDiagnostics,
} from "@/lib/ai/skitBudget";
import { z } from "zod";

export const runtime = "nodejs";

// --- Input Validation Schema (Zod Strict) ---

const RiskTierSchema = z.enum(["SAFE", "BALANCED", "SPICY"]);

const PersonaSchema = z.enum([
  "NONE",
  "DR_PICKLE",
  "CASH_KING",
  "ABSURD_BUDDY",
  "DEADPAN_OFFICE",
  "INFOMERCIAL_CHAOS",
]);

const GenerateSkitInputSchema = z.object({
  video_id: z.string().uuid().optional(),
  product_id: z.string().uuid().optional(),
  product_name: z.string().min(2).max(100).optional(),
  brand_name: z.string().max(100).optional(),
  product_display_name: z.string().max(100).optional(),
  cta_overlay: z.string().max(50).optional(),
  risk_tier: RiskTierSchema,
  persona: PersonaSchema,
  template_id: z.string().max(50).optional(),
  intensity: z.number().min(0).max(100).optional(),
  preset_id: z.string().max(50).optional(),
}).strict().refine(
  (data) => data.product_id || data.product_name,
  { message: "Either product_id or product_name is required" }
);

type GenerateSkitInput = z.infer<typeof GenerateSkitInputSchema>;
type Persona = z.infer<typeof PersonaSchema>;

// --- Persona Definitions (Internal Fictional Characters Only) ---

const PERSONA_GUIDELINES: Record<Persona, string> = {
  NONE: `
    No specific character. Write as a friendly, relatable narrator.
    Keep tone conversational and authentic.
  `,
  DR_PICKLE: `
    DR. PICKLE is our internal fictional character - a quirky, enthusiastic "scientist"
    who gets overly excited about simple discoveries. He wears a lab coat covered in
    pickle stickers and speaks with dramatic pauses. He's NOT a real doctor.
    Catchphrase: "Now THAT'S what I call a big dill!"
    Style: Enthusiastic, slightly nerdy, makes everything sound like a breakthrough.
  `,
  CASH_KING: `
    CASH KING is our internal fictional character - a flashy, over-the-top
    "deal hunter" who acts like finding a good product is winning the lottery.
    Wears gold chains made of obviously fake plastic. Self-aware parody of infomercial hosts.
    Catchphrase: "Ka-CHING, baby!"
    Style: High energy, comedic bragging, treats savings like treasure.
  `,
  ABSURD_BUDDY: `
    Comedic archetype: The Absurd Buddy.
    This is the friend who takes everything to ridiculous extremes.
    Overreacts to minor inconveniences, makes dramatic comparisons.
    Style: Deadpan delivery of absurd statements, escalating bits.
    Example: "Before this product, I was basically living like a cave person.
    And not even a cool cave person. Like the cave person other cave people avoided."
  `,
  DEADPAN_OFFICE: `
    Comedic archetype: Deadpan Office Worker.
    Speaks in monotone about mundane things as if they're earth-shattering.
    Corporate jargon mixed with genuine product enthusiasm.
    Style: Flat affect, pauses for effect, unexpectedly sincere moments.
    Example: "I've been in meetings. So many meetings. But this? This is the meeting
    that changed everything. It's not even a meeting. It's a lifestyle."
  `,
  INFOMERCIAL_CHAOS: `
    Comedic archetype: Chaotic Infomercial Parody.
    Self-aware parody of late-night infomercials where everything goes wrong.
    The demonstrator struggles with simple tasks, product "saves the day."
    Style: Exaggerated incompetence, product as unlikely hero.
    Example: "Are you tired of [simple task]? I was! I once spent THREE HOURS
    trying to [basic thing]. My neighbors called authorities."
  `,
};

// --- Risk Tier Prompt Modifiers ---

const TIER_GUIDELINES: Record<RiskTier, string> = {
  SAFE: `
    TONE LEVEL: SAFE (Light Humor)
    - Keep jokes mild and universally relatable
    - Avoid anything edgy or potentially offensive
    - Focus on wholesome, feel-good humor
    - No exaggeration about product benefits
    - No urgency or pressure tactics
    - Suitable for all audiences
  `,
  BALANCED: `
    TONE LEVEL: BALANCED (Sharper But Compliant)
    - Humor can be sharper, more specific
    - Light teasing of common frustrations is OK
    - Can use mild exaggeration for comedic effect
    - Still avoid any health claims or guarantees
    - Can create gentle urgency ("you'll want to try this")
    - Suitable for general social media audiences
  `,
  SPICY: `
    TONE LEVEL: SPICY (Energetic Parody)
    - High energy, bold comedic choices
    - Parody and satire are encouraged
    - Can push creative boundaries
    - Self-aware humor about advertising tropes
    - Still MUST avoid: health claims, guarantees, medical terms
    - Audience: People who appreciate bold comedy
  `,
};

// --- Compliance Reminder (Always Included) ---

const COMPLIANCE_REMINDER = `
CRITICAL COMPLIANCE RULES - NEVER VIOLATE:
1. NEVER use words: cure, treat, heal, diagnose, disease, prescription, clinically
2. NEVER use: guaranteed, guarantee, 100%, always, never (as absolutes)
3. NEVER reference: ADHD, depression, anxiety, pain relief, or any medical conditions
4. NEVER make health claims or promise specific results
5. NEVER "in the style of [real person]" - only use the provided fictional personas
6. Product benefits should be stated as experiences, not medical outcomes
   BAD: "cures your fatigue"
   GOOD: "I actually have energy for my 3pm meetings now"

REAL PERSON IMITATION PROHIBITION:
- NEVER imitate, reference, or parody any real celebrities, influencers, or public figures
- NEVER use catchphrases, mannerisms, or speaking styles associated with real people
- Only use the provided fictional character archetypes (Dr. Pickle, Cash King, etc.)
- Generic comedic archetypes (office worker, friend, news anchor) are fine as TYPES, not specific people
`;

// --- Intensity Guidelines ---

function buildIntensityGuidelines(intensity: number): string {
  if (intensity <= 20) {
    return `
COMEDY INTENSITY: LOW (${intensity}/100)
- Keep pacing relaxed and conversational
- Minimal exaggeration, understated humor
- Gentle observations rather than punchlines
- Calm, friendly energy throughout
`;
  } else if (intensity <= 40) {
    return `
COMEDY INTENSITY: MILD (${intensity}/100)
- Moderate pacing with some energy peaks
- Light exaggeration for comedic effect
- A few clear punchlines mixed with conversational moments
- Approachable, relatable energy
`;
  } else if (intensity <= 60) {
    return `
COMEDY INTENSITY: MEDIUM (${intensity}/100)
- Good comedic rhythm and pacing
- Confident exaggeration and callbacks
- Clear setup/punchline structure
- Engaging energy that holds attention
`;
  } else if (intensity <= 80) {
    return `
COMEDY INTENSITY: HIGH (${intensity}/100)
- Fast pacing with punchy delivery
- Bold exaggeration and sharp punchlines
- Quick cuts and rapid-fire energy
- Memorable one-liners and callbacks
`;
  } else {
    return `
COMEDY INTENSITY: MAXIMUM (${intensity}/100)
- Rapid-fire pacing, high energy throughout
- Maximum comedic exaggeration (within policy)
- Sharpest punchlines, fastest delivery
- Absurdist escalation and bold choices
- Still policy-compliant - no health claims or real person imitation
`;
  }
}

// --- Skit Structure Template ---

const SKIT_STRUCTURE_TEMPLATE = `
OUTPUT FORMAT (JSON only, no markdown):
{
  "hook_line": "Opening line that grabs attention (max 150 chars)",
  "beats": [
    {
      "t": "0:00-0:03",
      "action": "What happens visually",
      "dialogue": "What is said (optional)",
      "on_screen_text": "Text overlay (optional, max 50 chars)"
    }
  ],
  "b_roll": ["Suggested B-roll shot 1", "Shot 2"],
  "overlays": ["Text overlay suggestion 1", "Text overlay 2"],
  "cta_line": "Call to action spoken line",
  "cta_overlay": "CTA text overlay (max 40 chars)"
}

TIMING GUIDELINES:
- Total skit: 15-45 seconds
- Hook: First 3 seconds
- Problem/Setup: 3-10 seconds
- Solution/Product: 10-25 seconds
- CTA: Final 5 seconds
`;

// --- Main API Handler ---

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Parse and validate input
  let input: GenerateSkitInput;
  try {
    const body = await request.json();
    input = GenerateSkitInputSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return createApiErrorResponse("VALIDATION_ERROR", "Invalid input", 400, correlationId, {
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  // Note: All authenticated users can request any tier and intensity.
  // Safety is enforced by deterministic sanitization + risk scoring + auto-downgrade.
  // Intensity is soft-throttled via budget to prevent abuse at scale.

  try {
    // Fetch product info if product_id provided, otherwise use fallback product_name
    let product: { id: string | null; name: string; brand: string | null; category: string | null; description: string | null } | null = null;

    if (input.product_id) {
      const { data: dbProduct, error: productError } = await supabaseAdmin
        .from("products")
        .select("id, name, brand, category, description")
        .eq("id", input.product_id)
        .single();

      if (productError || !dbProduct) {
        return createApiErrorResponse("NOT_FOUND", "Product not found", 404, correlationId);
      }
      product = dbProduct;
    } else {
      // No product_id - use product_name fallback (standalone tool mode)
      product = {
        id: null,
        name: input.product_name || "the product",
        brand: input.brand_name || null,
        category: null,
        description: null,
      };
    }

    // Look up preset if provided
    let preset: SkitPreset | null = null;
    let presetIntensityClamped = false;
    if (input.preset_id) {
      preset = getSkitPreset(input.preset_id);
      if (!preset) {
        return createApiErrorResponse("VALIDATION_ERROR", `Unknown preset: ${input.preset_id}`, 400, correlationId);
      }
    }

    // Look up template - use preset default if no template specified
    let template: SkitTemplate | null = null;
    const effectiveTemplateId = input.template_id || preset?.default_template_id;
    if (effectiveTemplateId) {
      template = getSkitTemplate(effectiveTemplateId);
      if (!template) {
        return createApiErrorResponse("VALIDATION_ERROR", `Unknown template: ${effectiveTemplateId}`, 400, correlationId);
      }
    }

    // Get intensity - apply preset clamping first, then budget throttle
    let requestedIntensity = input.intensity ?? preset?.intensity_default ?? 50;
    const originalRequestedIntensity = input.intensity ?? preset?.intensity_default ?? 50;
    if (preset) {
      const presetClamp = clampIntensityToPreset(requestedIntensity, preset);
      if (presetClamp.wasClamped) {
        presetIntensityClamped = true;
        requestedIntensity = presetClamp.intensity;
      }
    }

    // Check debug mode for conditional diagnostics
    const debugMode = isDebugMode(request);

    // Check intensity budget (soft throttle - clamps instead of blocking)
    // Cost is based on original requested intensity (user intent) to prevent spam at high values
    const intensityBudget = await applySkitBudgetClamp({
      supabase: supabaseAdmin,
      orgId: "default", // org_id not available in auth context, use default bucket
      userId: authContext.user.id,
      intensityRequested: originalRequestedIntensity,
      correlationId,
    });

    // Apply budget clamp on top of preset clamp
    if (intensityBudget.budgetClamped) {
      requestedIntensity = intensityBudget.intensityApplied;
    }

    // Build the prompt
    const productName = input.product_display_name || product.name || "the product";
    const ctaOverlay = input.cta_overlay || "Link in bio!";

    const prompt = buildSkitPrompt({
      productName,
      brandName: product.brand || "",
      category: product.category || "",
      description: product.description || "",
      ctaOverlay,
      riskTier: input.risk_tier,
      persona: input.persona,
      template,
      preset,
      intensity: requestedIntensity,
    });

    // Call Anthropic API
    const rawSkit = await callAnthropicForSkit(prompt, correlationId);

    if (!rawSkit) {
      return createApiErrorResponse("AI_ERROR", "Failed to generate skit", 500, correlationId);
    }

    // Post-process with throttle enforcement
    const processed = postProcessSkit(rawSkit, input.risk_tier);

    // Validate against template constraints if template was used
    let templateValidation: { valid: boolean; issues: string[] } | null = null;
    if (template) {
      templateValidation = validateSkitAgainstTemplate(processed.skit, template);
    }

    // Determine entity type/id for audit: video > product > system
    const auditEntityType = input.video_id ? "video" : input.product_id ? "product" : "system";
    const auditEntityId = input.video_id || input.product_id || authContext.user.id;

    // Audit log
    auditLogAsync({
      correlation_id: correlationId,
      event_type: "ai.skit_generated",
      entity_type: auditEntityType,
      entity_id: auditEntityId,
      actor: authContext.user.id,
      summary: `Skit generated: ${input.risk_tier} -> ${processed.appliedTier}, persona=${input.persona}, intensity=${requestedIntensity}${intensityBudget.budgetClamped ? " (budget)" : ""}${presetIntensityClamped ? " (preset)" : ""}${preset ? `, preset=${preset.id}` : ""}${template ? `, template=${template.id}` : ""}`,
      details: {
        risk_tier_requested: input.risk_tier,
        risk_tier_applied: processed.appliedTier,
        persona: input.persona,
        template_id: effectiveTemplateId || null,
        preset_id: preset?.id || null,
        preset_name: preset?.name || null,
        product_id: input.product_id || null,
        product_name: product.name,
        risk_score: processed.riskScore,
        flags_count: processed.riskFlags.length,
        was_downgraded: processed.wasDowngraded,
        template_validation: templateValidation,
        intensity_requested: originalRequestedIntensity,
        intensity_applied: requestedIntensity,
        budget_clamped: intensityBudget.budgetClamped,
        preset_intensity_clamped: presetIntensityClamped,
        ...(debugMode ? { budget_diagnostics: intensityBudget.diagnostics } : {}),
      },
    });

    // Build response data
    const responseData: Record<string, unknown> = {
      risk_tier_applied: processed.appliedTier,
      risk_score: processed.riskScore,
      risk_flags: processed.riskFlags,
      template_id: effectiveTemplateId || null,
      template_validation: templateValidation,
      preset_id: preset?.id || null,
      preset_name: preset?.name || null,
      intensity_requested: originalRequestedIntensity,
      intensity_applied: requestedIntensity,
      budget_clamped: intensityBudget.budgetClamped,
      preset_intensity_clamped: presetIntensityClamped,
      skit: processed.skit,
    };

    // Include budget diagnostics only in debug mode
    if (debugMode) {
      responseData.budget_diagnostics = intensityBudget.diagnostics;
    }

    // Success response
    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data: responseData,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (error) {
    console.error(`[${correlationId}] Skit generation error:`, error);
    return createApiErrorResponse(
      "AI_ERROR",
      error instanceof Error ? error.message : "Skit generation failed",
      500,
      correlationId
    );
  }
}

// --- Prompt Builder ---

interface PromptParams {
  productName: string;
  brandName: string;
  category: string;
  description: string;
  ctaOverlay: string;
  riskTier: RiskTier;
  persona: Persona;
  template: SkitTemplate | null;
  preset: SkitPreset | null;
  intensity: number;
}

function buildSkitPrompt(params: PromptParams): string {
  const { productName, brandName, category, description, ctaOverlay, riskTier, persona, template, preset, intensity } = params;

  const personaGuideline = PERSONA_GUIDELINES[persona];
  const tierGuideline = TIER_GUIDELINES[riskTier];
  const templateSection = template ? buildTemplatePromptSection(template) : "";
  const presetSection = preset ? buildPresetPromptSection(preset) : "";
  const intensityGuideline = buildIntensityGuidelines(intensity);

  return `You are a TikTok skit writer for product advertisements. Generate a short, engaging skit.

PRODUCT INFO:
- Product Name: ${productName}
- Brand: ${brandName || "N/A"}
- Category: ${category || "General"}
- Description: ${description || "A great product"}

CTA OVERLAY TO USE: "${ctaOverlay}"

${tierGuideline}

${intensityGuideline}

${presetSection}

PERSONA/CHARACTER:
${personaGuideline}

${templateSection}

${COMPLIANCE_REMINDER}

${SKIT_STRUCTURE_TEMPLATE}

Generate a creative, compliant skit now. Output ONLY valid JSON, no explanation.`;
}

// --- Anthropic API Call ---

async function callAnthropicForSkit(prompt: string, correlationId: string): Promise<Skit | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(`[${correlationId}] ANTHROPIC_API_KEY not configured`);
    throw new Error("AI service not configured");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${correlationId}] Anthropic API error: ${response.status} - ${errorText}`);
    throw new Error(`AI service error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;

  if (!content) {
    console.error(`[${correlationId}] No content from Anthropic`);
    return null;
  }

  // Parse JSON from response
  try {
    // Try to extract JSON from response (may have markdown)
    let jsonStr = content;

    // Remove markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const parsed = JSON.parse(jsonStr.trim());

    if (!validateSkitStructure(parsed)) {
      console.error(`[${correlationId}] Invalid skit structure from AI`);
      return null;
    }

    return parsed as Skit;
  } catch (parseErr) {
    console.error(`[${correlationId}] Failed to parse skit JSON:`, parseErr);
    return null;
  }
}
