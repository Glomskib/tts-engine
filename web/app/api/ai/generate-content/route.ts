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
import { z } from "zod";
import { TONE_PROMPT_GUIDES, HUMOR_PROMPT_GUIDES } from "@/lib/persona-options";
import { requireCredits } from "@/lib/credits";

export const runtime = "nodejs";

// --- Input Validation Schema ---

const ContentTypeSchema = z.enum(["skit", "script", "hook"]);
const RiskTierSchema = z.enum(["SAFE", "BALANCED", "SPICY"]);
const PersonaSchema = z.enum([
  "NONE",
  "DR_PICKLE",
  "CASH_KING",
  "ABSURD_BUDDY",
  "DEADPAN_OFFICE",
  "INFOMERCIAL_CHAOS",
]);
const ActorTypeSchema = z.enum(["human", "ai_avatar", "voiceover", "mixed"]);
const TargetDurationSchema = z.enum(["quick", "standard", "extended", "long"]);
const ContentFormatSchema = z.enum([
  "skit_dialogue",
  "scene_montage",
  "pov_story",
  "product_demo_parody",
  "reaction_commentary",
  "day_in_life",
]);
const ScriptFormatSchema = z.enum([
  "story",
  "problem_solution",
  "listicle",
  "testimonial",
  "educational",
  "trend_react",
]);
const ScriptVoiceSchema = z.enum(["first_person", "narrator", "expert"]);
const HookTypeSchema = z.enum([
  "question",
  "bold_statement",
  "controversy",
  "relatable",
  "curiosity_gap",
  "shock",
]);

const GenerateContentInputSchema = z.object({
  content_type: ContentTypeSchema,
  product_id: z.string().uuid().optional(),
  product_name: z.string().min(3).max(100).optional(),
  brand_name: z.string().max(100).optional(),
  risk_tier: RiskTierSchema.optional().default("BALANCED"),
  persona: PersonaSchema.optional(),
  intensity: z.number().min(0).max(100).optional(),
  chaos_level: z.number().min(0).max(100).optional(),
  creative_direction: z.string().max(500).optional(),
  actor_type: ActorTypeSchema.optional(),
  target_duration: TargetDurationSchema.optional(),
  product_context: z.string().max(2000).optional(),
  // Skit-specific
  content_format: ContentFormatSchema.optional(),
  variation_count: z.number().int().min(1).max(5).optional(),
  preset_id: z.string().max(50).optional(),
  // Script-specific
  script_format: ScriptFormatSchema.optional(),
  script_voice: ScriptVoiceSchema.optional(),
  // Hook-specific
  hook_types: z.array(HookTypeSchema).optional(),
  hook_count: z.number().int().min(5).max(30).optional(),
  // Audience Intelligence
  audience_persona_id: z.string().uuid().optional(),
  pain_point_focus: z.array(z.string()).optional(),
  use_audience_language: z.boolean().optional().default(true),
}).strict().refine(
  (data) => data.product_id || data.product_name,
  { message: "Either product_id or product_name is required" }
);

// Audience Persona interface
interface AudiencePersona {
  id: string;
  name: string;
  description?: string;
  age_range?: string;
  gender?: string;
  income_level?: string;
  location_type?: string;
  life_stage?: string;
  lifestyle?: string;
  values?: string[];
  interests?: string[];
  personality_traits?: string[];
  tone?: string;
  tone_preference?: string;
  humor_style?: string;
  attention_span?: string;
  trust_builders?: string[];
  phrases_they_use?: string[];
  phrases_to_avoid?: string[];
  pain_points?: Array<{ point: string; intensity?: string }>;
  primary_pain_points?: string[];
  emotional_triggers?: string[];
  buying_objections?: string[];
  purchase_motivators?: string[];
  common_objections?: string[];
  content_types_preferred?: string[];
  platforms?: string[];
}

// Product interface
interface Product {
  id: string;
  name: string;
  brand: string;
  category?: string;
  tagline?: string;
  key_benefits?: string[];
  target_audience?: string;
}

// --- Prompt Builders ---

function buildAudienceContext(
  persona: AudiencePersona | null,
  painPointFocus: string[]
): string {
  if (!persona) return "";

  let context = "\n=== TARGET AUDIENCE ===\n";
  context += `PERSONA: "${persona.name}"\n`;
  if (persona.description) context += `${persona.description}\n`;

  // Demographics
  const demo: string[] = [];
  if (persona.age_range) demo.push(`Age: ${persona.age_range}`);
  if (persona.gender) demo.push(`Gender: ${persona.gender}`);
  if (persona.life_stage) demo.push(`Life stage: ${persona.life_stage}`);
  if (demo.length > 0) context += `Demographics: ${demo.join(", ")}\n`;

  // Pain points
  const allPainPoints = persona.primary_pain_points?.length
    ? persona.primary_pain_points
    : persona.pain_points?.map(pp => pp.point) || [];

  if (painPointFocus.length > 0) {
    context += `\nPRIMARY PAIN POINTS TO ADDRESS:\n`;
    painPointFocus.forEach((pp, i) => {
      context += `${i + 1}. "${pp}"\n`;
    });
    context += `Your hook MUST call out one of these pain points directly.\n`;
  } else if (allPainPoints.length > 0) {
    context += `\nPAIN POINTS (choose best fit):\n`;
    allPainPoints.slice(0, 4).forEach(pp => {
      context += `- ${pp}\n`;
    });
  }

  // Tone and humor
  const tone = persona.tone_preference || persona.tone;
  if (tone) {
    const guide = TONE_PROMPT_GUIDES[tone];
    context += `\nTONE: ${tone}${guide ? `\n${guide}` : ""}\n`;
  }
  if (persona.humor_style) {
    const guide = HUMOR_PROMPT_GUIDES[persona.humor_style];
    context += `HUMOR: ${persona.humor_style}${guide ? `\n${guide}` : ""}\n`;
  }

  // Language patterns
  if (persona.phrases_they_use?.length) {
    context += `\nPHRASES THEY USE: ${persona.phrases_they_use.slice(0, 3).map(p => `"${p}"`).join(", ")}\n`;
  }
  if (persona.phrases_to_avoid?.length) {
    context += `AVOID: ${persona.phrases_to_avoid.slice(0, 3).map(p => `"${p}"`).join(", ")}\n`;
  }

  return context;
}

function buildProductContext(product: Product): string {
  let context = `\n=== PRODUCT ===\n`;
  context += `Name: ${product.name}\n`;
  context += `Brand: ${product.brand}\n`;
  if (product.category) context += `Category: ${product.category}\n`;
  if (product.tagline) context += `Tagline: ${product.tagline}\n`;
  if (product.key_benefits?.length) {
    context += `Benefits: ${product.key_benefits.join(", ")}\n`;
  }
  if (product.target_audience) {
    context += `Target: ${product.target_audience}\n`;
  }
  return context;
}

// --- Main Handler ---

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    // Auth check
    const authContext = await getApiAuthContext();
    if (!authContext?.user) {
      return createApiErrorResponse(
        "UNAUTHORIZED",
        "Authentication required",
        401,
        correlationId
      );
    }

    // Parse and validate input
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return createApiErrorResponse(
        "VALIDATION_ERROR",
        "Invalid JSON body",
        400,
        correlationId
      );
    }

    const parsed = GenerateContentInputSchema.safeParse(body);
    if (!parsed.success) {
      return createApiErrorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map(e => e.message).join(", "),
        400,
        correlationId
      );
    }

    const input = parsed.data;

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

    // Credit costs: hook=1, script=3, skit=3
    const creditCost = input.content_type === "hook" ? 1 : 3;

    // Fetch product if ID provided
    let product: Product | null = null;
    if (input.product_id) {
      const { data: productData } = await supabaseAdmin
        .from("products")
        .select("id, name, brand, category, tagline, key_benefits, target_audience")
        .eq("id", input.product_id)
        .single();

      if (!productData) {
        return createApiErrorResponse(
          "PRODUCT_NOT_FOUND",
          "Product not found",
          404,
          correlationId
        );
      }
      product = productData as Product;
    } else if (input.product_name) {
      product = {
        id: "manual",
        name: input.product_name,
        brand: input.brand_name || "Unknown",
      };
    }

    // Fetch audience persona if provided
    let audiencePersona: AudiencePersona | null = null;
    if (input.audience_persona_id) {
      const { data: personaData } = await supabaseAdmin
        .from("audience_personas")
        .select("*")
        .eq("id", input.audience_persona_id)
        .single();

      if (personaData) {
        audiencePersona = personaData as AudiencePersona;
      }
    }

    // Build context
    const productContext = product ? buildProductContext(product) : "";
    const audienceContext = buildAudienceContext(
      audiencePersona,
      input.pain_point_focus || []
    );

    // Route to appropriate generator
    let result: unknown;

    if (input.content_type === "skit") {
      result = await generateSkit(input, productContext, audienceContext, product);
    } else if (input.content_type === "script") {
      result = await generateScript(input, productContext, audienceContext, product);
    } else if (input.content_type === "hook") {
      result = await generateHooks(input, productContext, audienceContext, product);
    }

    // Deduct credits (admins bypass)
    let creditsRemaining: number | undefined;
    if (!authContext.isAdmin) {
      const { data: deductResult } = await supabaseAdmin.rpc("add_credits", {
        p_user_id: authContext.user.id,
        p_amount: -creditCost,
        p_type: "generation",
        p_description: `${input.content_type} generation`,
      });
      creditsRemaining = deductResult?.[0]?.credits_remaining;
    }

    // Audit log
    auditLogAsync({
      correlation_id: correlationId,
      event_type: "content.generated",
      entity_type: "content",
      entity_id: product?.id || null,
      actor: authContext.user.id,
      summary: `Generated ${input.content_type} content for ${product?.name || "unknown product"}`,
      details: {
        content_type: input.content_type,
        product_id: input.product_id,
        product_name: product?.name,
      },
    });

    return NextResponse.json({
      ...result as object,
      content_type: input.content_type,
      audience_metadata: audiencePersona ? {
        persona_name: audiencePersona.name,
        pain_points_addressed: input.pain_point_focus || [],
      } : undefined,
      ...(creditsRemaining !== undefined ? { creditsRemaining } : {}),
    });

  } catch (err) {
    console.error("[generate-content] Error:", err);
    return createApiErrorResponse(
      "INTERNAL",
      "Failed to generate content",
      500,
      correlationId
    );
  }
}

// --- Skit Generator ---

async function generateSkit(
  input: z.infer<typeof GenerateContentInputSchema>,
  productContext: string,
  audienceContext: string,
  product: Product | null
) {
  const variationCount = input.variation_count || 3;
  const duration = input.target_duration || "standard";
  const format = input.content_format || "skit_dialogue";
  const riskTier = input.risk_tier || "BALANCED";

  const durationGuide = {
    quick: "15-20 seconds, 3-4 beats, ultra-tight pacing",
    standard: "30-45 seconds, 5-6 beats, classic TikTok rhythm",
    extended: "45-60 seconds, 7-8 beats, room for development",
    long: "60-90 seconds, 9-12 beats, full narrative arc",
  }[duration];

  const formatGuide = {
    skit_dialogue: "Two or more characters in a comedic scene with dialogue",
    scene_montage: "Visual scenes with voiceover narration",
    pov_story: "First-person POV, natural slice-of-life feel",
    product_demo_parody: "Infomercial style with intentional comedy",
    reaction_commentary: "Reacting to something with product tie-in",
    day_in_life: "Following a routine with product naturally integrated",
  }[format];

  const prompt = `You are a viral TikTok script writer. Generate ${variationCount} comedy skit variations for the following product.

${productContext}
${audienceContext}

FORMAT: ${format} - ${formatGuide}
DURATION: ${durationGuide}
RISK LEVEL: ${riskTier} - ${riskTier === "SAFE" ? "Keep it clean and universally appropriate" : riskTier === "BALANCED" ? "Light edginess is okay, avoid controversy" : "Edgy comedy is fine, push boundaries but stay brand-safe"}

${input.creative_direction ? `CREATIVE DIRECTION: ${input.creative_direction}` : ""}

For each variation, output valid JSON with this structure:
{
  "variations": [
    {
      "skit": {
        "hook_line": "Opening hook that stops the scroll",
        "beats": [
          {
            "t": "0:00",
            "action": "Visual action description",
            "dialogue": "What the character says (optional)",
            "on_screen_text": "Text overlay (optional)"
          }
        ],
        "cta_line": "Call to action spoken",
        "cta_overlay": "CTA text overlay",
        "b_roll": ["b-roll suggestion 1"],
        "overlays": ["additional text overlay"]
      }
    }
  ]
}

REQUIREMENTS:
- Hook must stop the scroll in under 3 seconds
- Product integration should feel natural, not forced
- Each variation should have a different angle/approach
- Include timing markers for each beat
- Keep dialogue natural and conversational
- Add humor that matches the target audience

Generate ${variationCount} unique variations now:`;

  // Call AI (using Anthropic/OpenAI based on environment)
  const aiResponse = await callAI(prompt);

  // Parse and validate response
  try {
    const parsed = JSON.parse(aiResponse);
    return {
      variations: parsed.variations || [],
      variation_count: variationCount,
      risk_tier_applied: riskTier,
    };
  } catch {
    // Fallback structure if parsing fails
    return {
      skit: {
        hook_line: "Hook generation failed - please try again",
        beats: [],
        cta_line: "",
        cta_overlay: "",
        b_roll: [],
        overlays: [],
      },
      risk_tier_applied: riskTier,
    };
  }
}

// --- Script Generator ---

async function generateScript(
  input: z.infer<typeof GenerateContentInputSchema>,
  productContext: string,
  audienceContext: string,
  product: Product | null
) {
  const format = input.script_format || "story";
  const voice = input.script_voice || "first_person";
  const duration = input.target_duration || "standard";

  const formatGuide = {
    story: "Personal narrative journey: 'I used to struggle with X, then I discovered Y'",
    problem_solution: "Clear problem statement followed by solution: 'Tired of X? Here's why Y works'",
    listicle: "Numbered points format: '3 reasons why...' or '5 things you didn't know'",
    testimonial: "Authentic review/reaction style, like unboxing or first impressions",
    educational: "How-to or explainer format, teaching something valuable",
    trend_react: "React to a trend with a product tie-in",
  }[format];

  const voiceGuide = {
    first_person: "First person perspective: 'I', 'me', 'my experience'",
    narrator: "Third-person observation: 'They', 'people', 'users'",
    expert: "Authority position: 'As a [profession]', 'Studies show'",
  }[voice];

  const durationGuide = {
    quick: "15-20 seconds, very concise",
    standard: "30-45 seconds, comfortable pace",
    extended: "45-60 seconds, room for details",
    long: "60-90 seconds, full story",
  }[duration];

  const prompt = `You are a viral social media copywriter. Write a script for the following product.

${productContext}
${audienceContext}

FORMAT: ${format} - ${formatGuide}
VOICE: ${voice} - ${voiceGuide}
DURATION: ${durationGuide}

${input.creative_direction ? `CREATIVE DIRECTION: ${input.creative_direction}` : ""}

Output valid JSON with this structure:
{
  "script": {
    "hook": "Opening hook that stops the scroll (1-2 sentences)",
    "body": [
      "First paragraph/section",
      "Second paragraph/section",
      "Third paragraph/section"
    ],
    "cta": "Clear call to action",
    "talking_points": ["Key point 1", "Key point 2"],
    "visual_suggestions": ["Visual idea 1", "Visual idea 2"]
  }
}

REQUIREMENTS:
- Hook must be scroll-stopping
- Body should flow naturally when read aloud
- CTA should feel organic, not salesy
- Match the tone to the target audience
- Keep it authentic and conversational

Generate the script now:`;

  const aiResponse = await callAI(prompt);

  try {
    const parsed = JSON.parse(aiResponse);
    return {
      script: parsed.script,
      risk_tier_applied: input.risk_tier || "BALANCED",
    };
  } catch {
    return {
      script: {
        hook: "Script generation failed - please try again",
        body: [],
        cta: "",
        talking_points: [],
        visual_suggestions: [],
      },
      risk_tier_applied: input.risk_tier || "BALANCED",
    };
  }
}

// --- Hook Generator ---

async function generateHooks(
  input: z.infer<typeof GenerateContentInputSchema>,
  productContext: string,
  audienceContext: string,
  product: Product | null
) {
  const hookTypes = input.hook_types || ["question", "bold_statement", "relatable"];
  const hookCount = input.hook_count || 10;

  const hookTypeGuides = {
    question: "Opens with an engaging question: 'Ever wonder why...?', 'What if I told you...?'",
    bold_statement: "Confident claim: 'This changed everything', 'I was today years old when...'",
    controversy: "Challenges belief: 'Unpopular opinion:', 'Everyone is wrong about...'",
    relatable: "Shared experience: 'POV: you just...', 'When you finally...'",
    curiosity_gap: "Teases without revealing: 'I can't believe this worked', 'The secret they don't tell you'",
    shock: "Unexpected opener: 'Wait... what if', 'I almost didn't share this'",
  };

  const selectedGuides = hookTypes.map(t => `- ${t.toUpperCase()}: ${hookTypeGuides[t]}`).join("\n");

  const prompt = `You are a viral hook specialist. Generate ${hookCount} scroll-stopping hooks for this product.

${productContext}
${audienceContext}

HOOK TYPES TO GENERATE:
${selectedGuides}

${input.creative_direction ? `CREATIVE DIRECTION: ${input.creative_direction}` : ""}

Output valid JSON with this structure:
{
  "hooks": [
    {
      "text": "The actual hook text",
      "type": "question|bold_statement|controversy|relatable|curiosity_gap|shock",
      "strength_score": 8
    }
  ]
}

REQUIREMENTS:
- Each hook must be under 15 words
- Must stop the scroll immediately
- Mix of the specified hook types
- Rate each hook's strength from 1-10
- Hooks should speak directly to the target audience's pain points
- Avoid clichés and overused phrases

Generate ${hookCount} unique hooks now:`;

  const aiResponse = await callAI(prompt);

  try {
    const parsed = JSON.parse(aiResponse);
    return {
      hooks: parsed,
      risk_tier_applied: input.risk_tier || "BALANCED",
    };
  } catch {
    return {
      hooks: {
        hooks: [],
      },
      risk_tier_applied: input.risk_tier || "BALANCED",
    };
  }
}

// --- AI Call Helper ---

async function callAI(prompt: string): Promise<string> {
  // Use Anthropic Claude
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
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
      max_tokens: 4096,
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
    console.error("[AI] API error:", errorText);
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || "";

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  // Try to find JSON object directly
  const objectMatch = content.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return objectMatch[0];
  }

  return content;
}
