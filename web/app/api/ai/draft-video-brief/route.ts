import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Hook families for diverse generation
const HOOK_FAMILIES = [
  "pattern_interrupt",
  "relatable_pain",
  "proof_teaser",
  "contrarian",
  "mini_story",
  "curiosity_gap",
] as const;

type HookFamily = (typeof HOOK_FAMILIES)[number];

// Tone presets
const TONE_PRESETS = [
  "ugc_casual",
  "funny",
  "serious",
  "fast_paced",
  "soft_sell",
] as const;

type TonePreset = (typeof TONE_PRESETS)[number];

// Banned weak phrases (configurable)
const BANNED_PHRASES = [
  "stop what you're doing",
  "game changer",
  "here's why",
  "the difference?",
  "you won't believe",
  "this changed my life",
  "life hack",
  "mind blown",
];

// Hook score interface
interface HookScore {
  curiosity: number;
  clarity: number;
  ugc_fit: number;
  overall: number;
}

// Enhanced output interface
interface DraftVideoBriefResult {
  // Hook Package (expanded)
  spoken_hook_options: string[];
  spoken_hook_by_family: Record<string, string[]>;
  hook_scores: Record<string, HookScore>;
  selected_spoken_hook: string;

  // Visual hooks (multiple options now)
  visual_hook_options: string[];
  selected_visual_hook: string;
  visual_hook: string; // Legacy alias

  // On-screen text options
  on_screen_text_hook_options: string[];
  selected_on_screen_text_hook: string;
  mid_overlays: string[];
  cta_overlay_options: string[];
  selected_cta_overlay: string;

  // Legacy fields for backwards compatibility
  on_screen_text_mid: string[];
  on_screen_text_cta: string;

  // Standard fields
  angle_options: string[];
  selected_angle: string;
  proof_type: "testimonial" | "demo" | "comparison" | "other";
  notes: string;
  broll_ideas: string[];
  script_draft: string;

  // Legacy fields
  hook_options: string[];
  selected_hook: string;
  on_screen_text: string[];
}

interface DraftVideoBriefInput {
  product_id: string;
  hook_type?: string; // Now accepts any family or "all"
  tone_preset?: TonePreset;
  target_length?: string;
  reference_script_text?: string;
  reference_script_id?: string;
  reference_video_url?: string;
  nonce?: string; // Unique ID for this generation request
  // Readjust mode fields
  mode?: "generate" | "readjust";
  locked_fields?: string[];
  original_ai_draft?: Partial<DraftVideoBriefResult>;
  current_state?: {
    selectedSpokenHook?: string;
    visualHook?: string;
    selectedTextHook?: string;
    onScreenTextMid?: string[];
    onScreenTextCta?: string;
    selectedAngle?: string;
    proofType?: string;
    notes?: string;
    scriptDraft?: string;
  };
}

// Safe JSON parser with repair logic
function safeParseJSON(content: string): { success: boolean; data: Partial<DraftVideoBriefResult> | null; strategy: string } {
  // First attempt: direct parse
  try {
    const parsed = JSON.parse(content);
    return { success: true, data: parsed, strategy: "direct" };
  } catch (error) {
    console.log(`Direct JSON parse failed: ${error}`);
  }

  // Second attempt: extract JSON from markdown code blocks
  try {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1].trim());
      return { success: true, data: parsed, strategy: "markdown_extract" };
    }
  } catch (error) {
    console.log(`Markdown extract parse failed: ${error}`);
  }

  // Third attempt: repair pass
  try {
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
      throw new Error("No valid JSON object boundaries found");
    }

    let jsonSubstring = content.substring(firstBrace, lastBrace + 1);

    // Repair control characters inside quoted strings
    jsonSubstring = jsonSubstring.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match, innerContent) => {
      innerContent = innerContent.replace(/\n/g, "\\n");
      innerContent = innerContent.replace(/\t/g, "\\t");
      innerContent = innerContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
      return `"${innerContent}"`;
    });

    const parsed = JSON.parse(jsonSubstring);
    return { success: true, data: parsed, strategy: "repair" };
  } catch (error) {
    console.log(`Repair JSON parse failed: ${error}`);
  }

  return { success: false, data: null, strategy: "failed" };
}

// Hook family descriptions for AI prompting
const HOOK_FAMILY_DESCRIPTIONS: Record<HookFamily, string> = {
  pattern_interrupt: "Start with something jarring, unexpected, or pattern-breaking. Make them stop scrolling. Bold statements, surprising visuals, or unexpected reveals.",
  relatable_pain: "Open with a frustration, problem, or struggle the viewer deeply relates to. 'Ever feel like...', 'Am I the only one who...', empathetic pain points.",
  proof_teaser: "Tease incredible results, transformation, or proof right away. 'What happened after 30 days...', 'The before vs after...', hint at outcome.",
  contrarian: "Challenge conventional wisdom or go against popular opinion. 'Everyone's wrong about...', 'Unpopular opinion:', 'Stop doing this...'",
  mini_story: "Start with a personal anecdote or story setup. 'So yesterday...', 'Story time:', 'Let me tell you what happened...', narrative hooks.",
  curiosity_gap: "Create an information gap that demands closure. 'The thing nobody tells you about...', 'I finally figured out why...', open loops.",
};

// Tone preset descriptions for AI prompting
const TONE_DESCRIPTIONS: Record<TonePreset, string> = {
  ugc_casual: "Natural, conversational, like talking to a friend. Use filler words occasionally. Not polished or scripted-sounding.",
  funny: "Lighthearted, witty, use humor and playful energy. Can be self-deprecating or observational. Make them smile.",
  serious: "Direct, authoritative, no-nonsense. Focus on facts and credibility. Confident delivery.",
  fast_paced: "Quick cuts, rapid delivery, high energy. Get to the point fast. Punchy sentences. No fluff.",
  soft_sell: "Gentle, storytelling approach. Let the product speak for itself. Subtle recommendations, no hard CTAs.",
};

/**
 * Fetch recent hooks for this product to prevent repetition
 */
async function getRecentHooksForProduct(productId: string, limit: number = 20): Promise<string[]> {
  try {
    const { data } = await supabaseAdmin
      .from("ai_generation_runs")
      .select("spoken_hooks")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!data) return [];

    // Flatten all hooks from recent generations
    const allHooks: string[] = [];
    for (const row of data) {
      if (Array.isArray(row.spoken_hooks)) {
        allHooks.push(...row.spoken_hooks);
      }
    }
    return [...new Set(allHooks)]; // Dedupe
  } catch (error) {
    console.error("Failed to fetch recent hooks:", error);
    return [];
  }
}

/**
 * Log an AI generation run to the database
 */
async function logGenerationRun(params: {
  productId: string;
  nonce: string;
  hookType: string;
  tonePreset: string;
  targetLength: string;
  output: DraftVideoBriefResult;
  aiProvider: string;
  correlationId: string;
}): Promise<void> {
  try {
    await supabaseAdmin.from("ai_generation_runs").insert({
      product_id: params.productId,
      nonce: params.nonce,
      prompt_version: "v2",
      hook_type: params.hookType,
      tone_preset: params.tonePreset,
      target_length: params.targetLength,
      output_json: params.output,
      spoken_hooks: params.output.spoken_hook_options || [],
      ai_provider: params.aiProvider,
      correlation_id: params.correlationId,
    });
  } catch (error) {
    console.error("Failed to log generation run:", error);
    // Don't throw - logging failure shouldn't break the response
  }
}

/**
 * Build the enhanced AI prompt for diverse, high-quality hooks
 */
function buildEnhancedPrompt(params: {
  brand: string;
  productName: string;
  category: string;
  productUrl: string;
  productNotes: string;
  hookType: string;
  tonePreset: TonePreset;
  targetLength: string;
  referenceScript?: string;
  referenceVideoUrl?: string;
  recentHooks: string[];
  nonce: string;
}): string {
  const {
    brand,
    productName,
    category,
    productUrl,
    productNotes,
    hookType,
    tonePreset,
    targetLength,
    referenceScript,
    referenceVideoUrl,
    recentHooks,
    nonce,
  } = params;

  let prompt = `Generation ID: ${nonce}
Generate a FRESH, NOVEL TikTok Shop video brief. Do NOT reuse hooks from previous generations.

PRODUCT:
- Brand: ${brand}
- Product: ${productName}
- Category: ${category}
${productUrl ? `- URL: ${productUrl}` : ""}
${productNotes ? `- Notes: ${productNotes}` : ""}

TONE: ${tonePreset}
${TONE_DESCRIPTIONS[tonePreset]}

TARGET LENGTH: ${targetLength}

`;

  // Hook type guidance
  if (hookType && hookType !== "all" && HOOK_FAMILY_DESCRIPTIONS[hookType as HookFamily]) {
    prompt += `PRIMARY HOOK STYLE: ${hookType}
${HOOK_FAMILY_DESCRIPTIONS[hookType as HookFamily]}

`;
  }

  // Reference materials
  if (referenceScript) {
    prompt += `REFERENCE SCRIPT (use structure/tone as inspiration, but create NEW hooks):
"""
${referenceScript.slice(0, 1000)}
"""

`;
  }

  if (referenceVideoUrl) {
    prompt += `Reference video for pacing/style: ${referenceVideoUrl}

`;
  }

  // No-repeat instruction
  if (recentHooks.length > 0) {
    prompt += `CRITICAL - DO NOT REPEAT THESE HOOKS (already used for this product):
${recentHooks.slice(0, 20).map(h => `- "${h}"`).join("\n")}

`;
  }

  // Banned phrases
  prompt += `BANNED WEAK PHRASES - DO NOT USE:
${BANNED_PHRASES.map(p => `- "${p}"`).join("\n")}

`;

  // Output specification
  prompt += `Generate a JSON object with these EXACT fields:

SPOKEN HOOKS (12 total, 2+ from EACH family):
1. spoken_hook_options: Array of 12 unique spoken hooks (5-15 words each):
   - At least 2 "pattern_interrupt" hooks
   - At least 2 "relatable_pain" hooks
   - At least 2 "proof_teaser" hooks
   - At least 2 "contrarian" hooks
   - At least 2 "mini_story" hooks
   - At least 2 "curiosity_gap" hooks

2. spoken_hook_by_family: Object with arrays for each family:
   {
     "pattern_interrupt": ["hook1", "hook2"],
     "relatable_pain": ["hook1", "hook2"],
     "proof_teaser": ["hook1", "hook2"],
     "contrarian": ["hook1", "hook2"],
     "mini_story": ["hook1", "hook2"],
     "curiosity_gap": ["hook1", "hook2"]
   }

3. hook_scores: Score each spoken hook (use hook text as key):
   {
     "hook text": {
       "curiosity": 1-10,
       "clarity": 1-10,
       "ugc_fit": 1-10,
       "overall": 1-10
     }
   }

4. selected_spoken_hook: The BEST hook from options (highest overall score)

VISUAL HOOKS (6 options):
5. visual_hook_options: Array of 6 opening shot directions (1-2 sentences each)
6. selected_visual_hook: Best visual hook from options

ON-SCREEN TEXT:
7. on_screen_text_hook_options: Array of 10 text overlays (max 6 words each, minimal punctuation)
8. selected_on_screen_text_hook: Best text overlay
9. mid_overlays: Array of 6 mid-video overlays (2-4 words each)
10. cta_overlay_options: Array of 5 CTA overlays (TikTok Shop compliant)
11. selected_cta_overlay: Best CTA overlay

STANDARD FIELDS:
12. angle_options: Array of 4 marketing angles
13. selected_angle: Best angle
14. proof_type: "testimonial", "demo", or "comparison"
15. notes: Production notes (1-2 sentences)
16. broll_ideas: Array of 4 B-roll shot ideas
17. script_draft: Complete ${targetLength} script in ${tonePreset} tone

REQUIREMENTS:
- Every hook must be UNIQUE and FRESH
- NO banned phrases
- For supplements: NO medical claims (avoid "cure", "treat", "diagnose", "guaranteed")
- Hooks should feel natural for UGC/TikTok
- Scores should be honest - don't give everything 10/10
- Text overlays: SHORT, punchy, no excessive punctuation

Return ONLY valid JSON. No markdown. No code fences.`;

  return prompt;
}

/**
 * Readjust brief - modify non-locked fields to align with user edits
 */
function readjustBrief(
  original: Partial<DraftVideoBriefResult>,
  currentState: DraftVideoBriefInput["current_state"],
  lockedFields: string[],
  brand: string,
  productName: string,
  tonePreset: TonePreset,
  targetLength: string
): DraftVideoBriefResult {
  const isLocked = (field: string) => lockedFields.includes(field);

  // Start with original as base
  const result: DraftVideoBriefResult = {
    spoken_hook_options: original.spoken_hook_options || [],
    spoken_hook_by_family: original.spoken_hook_by_family || {},
    hook_scores: original.hook_scores || {},
    selected_spoken_hook: original.selected_spoken_hook || "",
    visual_hook_options: original.visual_hook_options || [],
    selected_visual_hook: original.selected_visual_hook || original.visual_hook || "",
    visual_hook: original.visual_hook || "",
    on_screen_text_hook_options: original.on_screen_text_hook_options || [],
    selected_on_screen_text_hook: original.selected_on_screen_text_hook || "",
    mid_overlays: original.mid_overlays || original.on_screen_text_mid || [],
    cta_overlay_options: original.cta_overlay_options || [],
    selected_cta_overlay: original.selected_cta_overlay || original.on_screen_text_cta || "Link in bio",
    on_screen_text_mid: original.on_screen_text_mid || [],
    on_screen_text_cta: original.on_screen_text_cta || "Link in bio",
    angle_options: original.angle_options || [],
    selected_angle: original.selected_angle || "",
    proof_type: original.proof_type || "testimonial",
    notes: original.notes || "",
    broll_ideas: original.broll_ideas || [],
    script_draft: original.script_draft || "",
    hook_options: original.hook_options || [],
    selected_hook: original.selected_hook || "",
    on_screen_text: original.on_screen_text || [],
  };

  // Apply locked values from current state
  const spokenHook = isLocked("selectedSpokenHook") && currentState?.selectedSpokenHook
    ? currentState.selectedSpokenHook
    : result.selected_spoken_hook;

  const proofType = isLocked("proofType") && currentState?.proofType
    ? (currentState.proofType as "testimonial" | "demo" | "comparison" | "other")
    : result.proof_type;

  // If visual hook not locked but spoken hook is, regenerate visual to match
  if (!isLocked("visualHook") && isLocked("selectedSpokenHook")) {
    if (spokenHook.toLowerCase().includes("stop") || spokenHook.toLowerCase().includes("wait") || spokenHook.toLowerCase().includes("hold")) {
      result.selected_visual_hook = `Sudden close-up on face with wide eyes or raised eyebrows, then reveal ${productName}`;
    } else if (spokenHook.toLowerCase().includes("story") || spokenHook.toLowerCase().includes("yesterday") || spokenHook.toLowerCase().includes("so ")) {
      result.selected_visual_hook = `Casual setup - relaxed posture, natural lighting, like FaceTiming a friend`;
    } else if (spokenHook.toLowerCase().includes("result") || spokenHook.toLowerCase().includes("after") || spokenHook.toLowerCase().includes("before")) {
      result.selected_visual_hook = `Quick flash of transformation/result, then cut to speaking`;
    } else {
      result.selected_visual_hook = `Direct eye contact with camera, slightly leaning in, engaged expression`;
    }
    result.visual_hook = result.selected_visual_hook;
  } else if (isLocked("visualHook") && currentState?.visualHook) {
    result.selected_visual_hook = currentState.visualHook;
    result.visual_hook = currentState.visualHook;
  }

  // Mid overlays based on proof type
  if (!isLocked("onScreenTextMid")) {
    if (proofType === "testimonial") {
      result.mid_overlays = ["Real talk", "Honest review", "My experience", "No cap", "Truth bomb", "Real results"];
    } else if (proofType === "demo") {
      result.mid_overlays = ["Watch this", "See how", "In action", "The process", "How I use it", "Step by step"];
    } else {
      result.mid_overlays = ["Side by side", "Before vs after", "The upgrade", "Night and day", "Comparison time", "See the diff"];
    }
    result.on_screen_text_mid = result.mid_overlays.slice(0, 3);
  } else if (currentState?.onScreenTextMid) {
    result.mid_overlays = currentState.onScreenTextMid;
    result.on_screen_text_mid = currentState.onScreenTextMid;
  }

  // CTA based on tone
  if (!isLocked("onScreenTextCta")) {
    if (tonePreset === "soft_sell") {
      result.selected_cta_overlay = "Link if curious";
      result.cta_overlay_options = ["Link if curious", "Check it out", "In my bio", "Details below", "More info linked"];
    } else if (tonePreset === "fast_paced") {
      result.selected_cta_overlay = "Link NOW";
      result.cta_overlay_options = ["Link NOW", "Go go go", "Tap fast", "Link in bio GO", "Get it"];
    } else {
      result.selected_cta_overlay = "Link in bio";
      result.cta_overlay_options = ["Link in bio", "Linked below", "Shop now", "Grab yours", "Available now"];
    }
    result.on_screen_text_cta = result.selected_cta_overlay;
  } else if (currentState?.onScreenTextCta) {
    result.selected_cta_overlay = currentState.onScreenTextCta;
    result.on_screen_text_cta = currentState.onScreenTextCta;
  }

  // Apply other locked fields
  if (isLocked("selectedAngle") && currentState?.selectedAngle) {
    result.selected_angle = currentState.selectedAngle;
  }
  if (isLocked("proofType") && currentState?.proofType) {
    result.proof_type = currentState.proofType as "testimonial" | "demo" | "comparison" | "other";
  }
  if (isLocked("notes") && currentState?.notes) {
    result.notes = currentState.notes;
  }

  // Regenerate script if not locked
  if (!isLocked("scriptDraft")) {
    const toneOpener = tonePreset === "ugc_casual" ? "Okay so" : tonePreset === "fast_paced" ? "Look." : "So";
    const proofSection = proofType === "testimonial"
      ? "Been using this for a bit now and I have thoughts..."
      : proofType === "demo"
        ? "Let me show you how this actually works..."
        : "Compared to what I was using before - night and day.";

    result.script_draft = `${spokenHook}

${toneOpener} I've been using ${productName} from ${brand} and had to share.

${proofSection}

Honestly? Quality is on point. It's become part of my routine now.

If you want to try it, link's in my bio - ${brand} is on TikTok Shop!`;
  } else if (currentState?.scriptDraft) {
    result.script_draft = currentState.scriptDraft;
  }

  // Update legacy fields
  result.selected_spoken_hook = spokenHook;
  result.hook_options = result.spoken_hook_options;
  result.selected_hook = result.selected_spoken_hook;
  result.on_screen_text = [
    result.selected_on_screen_text_hook,
    ...result.on_screen_text_mid,
    result.on_screen_text_cta,
  ];

  return result;
}

/**
 * POST /api/ai/draft-video-brief
 *
 * Generates a complete video brief with diverse hooks across multiple families.
 * Uses nonce-based no-repeat logic and logs all generations.
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON", correlation_id: correlationId },
      { status: 400 }
    );
  }

  const {
    product_id,
    hook_type = "all",
    tone_preset = "ugc_casual",
    target_length = "15-20s",
    reference_script_text,
    reference_script_id,
    reference_video_url,
    nonce = crypto.randomUUID(), // Generate if not provided
    mode = "generate",
    locked_fields = [],
    original_ai_draft,
    current_state,
  } = body as DraftVideoBriefInput;

  // Validate product_id
  if (!product_id || typeof product_id !== "string" || product_id.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "product_id is required", error_code: "VALIDATION_ERROR", correlation_id: correlationId },
      { status: 400 }
    );
  }

  // Validate tone_preset
  const validTonePreset = TONE_PRESETS.includes(tone_preset as TonePreset) ? (tone_preset as TonePreset) : "ugc_casual";

  // Fetch product with brand info
  const { data: product, error: productError } = await supabaseAdmin
    .from("products")
    .select("id, name, brand, category, primary_link, notes")
    .eq("id", product_id.trim())
    .single();

  if (productError || !product) {
    return NextResponse.json(
      { ok: false, error: "Product not found", error_code: "NOT_FOUND", correlation_id: correlationId },
      { status: 404 }
    );
  }

  // If reference_script_id provided, fetch it
  let referenceScriptContent = reference_script_text || "";
  if (reference_script_id && !referenceScriptContent) {
    try {
      const { data: script } = await supabaseAdmin
        .from("scripts")
        .select("spoken_script")
        .eq("id", reference_script_id)
        .single();
      if (script?.spoken_script) {
        referenceScriptContent = script.spoken_script;
      }
    } catch {
      console.log(`[${correlationId}] Could not fetch reference script ${reference_script_id}`);
    }
  }

  const brand = product.brand || "Brand";
  const productName = product.name || "Product";
  const category = product.category || "general";
  const productUrl = product.primary_link || "";
  const productNotes = product.notes || "";

  // Handle readjust mode
  if (mode === "readjust" && original_ai_draft && current_state) {
    console.log(`[${correlationId}] Processing readjust request with ${locked_fields.length} locked fields`);

    const readjustedResult = readjustBrief(
      original_ai_draft,
      current_state,
      locked_fields,
      brand,
      productName,
      validTonePreset,
      target_length
    );

    return NextResponse.json({
      ok: true,
      data: readjustedResult,
      meta: {
        product_id: product_id.trim(),
        brand,
        product_name: productName,
        mode: "readjust",
        locked_fields,
        tone_preset: validTonePreset,
        target_length,
      },
      correlation_id: correlationId,
    });
  }

  // Check for AI API keys
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  // CRITICAL: Do NOT fall back to templates for generation
  // Templates produce repetitive, weak hooks
  if (!anthropicKey && !openaiKey) {
    console.error(`[${correlationId}] No AI API key configured - cannot generate quality hooks`);
    return NextResponse.json(
      {
        ok: false,
        error: "AI generation unavailable. Please configure ANTHROPIC_API_KEY or OPENAI_API_KEY.",
        error_code: "AI_UNAVAILABLE",
        correlation_id: correlationId,
      },
      { status: 503 }
    );
  }

  try {
    // Fetch recent hooks for no-repeat logic
    const recentHooks = await getRecentHooksForProduct(product_id.trim());
    console.log(`[${correlationId}] Found ${recentHooks.length} recent hooks to avoid`);

    // Build the enhanced prompt
    const prompt = buildEnhancedPrompt({
      brand,
      productName,
      category,
      productUrl,
      productNotes,
      hookType: hook_type,
      tonePreset: validTonePreset,
      targetLength: target_length,
      referenceScript: referenceScriptContent,
      referenceVideoUrl: reference_video_url,
      recentHooks,
      nonce,
    });

    let aiResult: Partial<DraftVideoBriefResult> | null = null;
    let aiProvider = "";

    if (anthropicKey) {
      aiProvider = "anthropic";
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 4000,
          temperature: 0.9, // Higher temperature for more variety
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
      }

      const anthropicResult = await response.json();
      const content = anthropicResult.content?.[0]?.text;

      if (!content) {
        throw new Error("No content returned from Anthropic");
      }

      console.log(`[${correlationId}] Anthropic response length: ${content.length}`);
      const parseResult = safeParseJSON(content);

      if (!parseResult.success || !parseResult.data) {
        console.error(`[${correlationId}] Failed to parse Anthropic response`);
        throw new Error("Failed to parse AI response");
      }

      aiResult = parseResult.data;

    } else if (openaiKey) {
      aiProvider = "openai";
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4-turbo-preview",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 4000,
          temperature: 0.9,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const openaiResult = await response.json();
      const content = openaiResult.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("No content returned from OpenAI");
      }

      console.log(`[${correlationId}] OpenAI response length: ${content.length}`);
      const parseResult = safeParseJSON(content);

      if (!parseResult.success || !parseResult.data) {
        console.error(`[${correlationId}] Failed to parse OpenAI response`);
        throw new Error("Failed to parse AI response");
      }

      aiResult = parseResult.data;
    }

    if (!aiResult) {
      throw new Error("No AI result generated");
    }

    // Validate and build result
    const spokenHooks = Array.isArray(aiResult.spoken_hook_options) ? aiResult.spoken_hook_options.slice(0, 15) : [];
    const visualHooks = Array.isArray(aiResult.visual_hook_options) ? aiResult.visual_hook_options.slice(0, 6) : [];
    const textHooks = Array.isArray(aiResult.on_screen_text_hook_options) ? aiResult.on_screen_text_hook_options.slice(0, 10) : [];
    const midOverlays = Array.isArray(aiResult.mid_overlays) ? aiResult.mid_overlays.slice(0, 6) : [];
    const ctaOptions = Array.isArray(aiResult.cta_overlay_options) ? aiResult.cta_overlay_options.slice(0, 5) : [];

    // Find best hook by score
    let bestHook = spokenHooks[0] || "";
    let bestScore = 0;
    const hookScores = aiResult.hook_scores || {};
    for (const hook of spokenHooks) {
      const score = hookScores[hook]?.overall || 0;
      if (score > bestScore) {
        bestScore = score;
        bestHook = hook;
      }
    }

    const validatedResult: DraftVideoBriefResult = {
      // Hook Package (expanded)
      spoken_hook_options: spokenHooks,
      spoken_hook_by_family: aiResult.spoken_hook_by_family || {},
      hook_scores: hookScores,
      selected_spoken_hook: bestHook,

      // Visual hooks
      visual_hook_options: visualHooks,
      selected_visual_hook: visualHooks[0] || "Open on close-up of face, engaging expression, then reveal product",
      visual_hook: visualHooks[0] || "Open on close-up of face, engaging expression, then reveal product",

      // On-screen text
      on_screen_text_hook_options: textHooks,
      selected_on_screen_text_hook: textHooks[0] || "Watch this",
      mid_overlays: midOverlays,
      cta_overlay_options: ctaOptions.length > 0 ? ctaOptions : ["Link in bio", "Shop now", "Grab yours", "Get it", "Linked below"],
      selected_cta_overlay: ctaOptions[0] || "Link in bio",

      // Legacy fields
      on_screen_text_mid: midOverlays.slice(0, 3),
      on_screen_text_cta: ctaOptions[0] || "Link in bio",

      // Standard fields
      angle_options: Array.isArray(aiResult.angle_options) ? aiResult.angle_options.slice(0, 5) : [],
      selected_angle: String(aiResult.selected_angle || aiResult.angle_options?.[0] || ""),
      proof_type: ["testimonial", "demo", "comparison", "other"].includes(aiResult.proof_type as string)
        ? (aiResult.proof_type as "testimonial" | "demo" | "comparison" | "other")
        : "testimonial",
      notes: String(aiResult.notes || ""),
      broll_ideas: Array.isArray(aiResult.broll_ideas) ? aiResult.broll_ideas.slice(0, 5) : [],
      script_draft: String(aiResult.script_draft || ""),

      // Legacy backwards compat
      hook_options: spokenHooks,
      selected_hook: bestHook,
      on_screen_text: [
        textHooks[0] || "",
        ...midOverlays.slice(0, 3),
        ctaOptions[0] || "Link in bio",
      ],
    };

    // Log this generation
    await logGenerationRun({
      productId: product_id.trim(),
      nonce,
      hookType: hook_type,
      tonePreset: validTonePreset,
      targetLength: target_length,
      output: validatedResult,
      aiProvider,
      correlationId,
    });

    return NextResponse.json({
      ok: true,
      data: validatedResult,
      meta: {
        product_id: product_id.trim(),
        brand,
        product_name: productName,
        ai_provider: aiProvider,
        hook_type: hook_type,
        tone_preset: validTonePreset,
        target_length,
        nonce,
        hooks_avoided: recentHooks.length,
        has_reference: !!referenceScriptContent,
      },
      correlation_id: correlationId,
    });

  } catch (error) {
    console.error(`[${correlationId}] AI draft generation error:`, error);

    // Return error - do NOT fall back to templates
    return NextResponse.json(
      {
        ok: false,
        error: `AI generation failed: ${error instanceof Error ? error.message : String(error)}`,
        error_code: "AI_ERROR",
        correlation_id: correlationId,
      },
      { status: 500 }
    );
  }
}
