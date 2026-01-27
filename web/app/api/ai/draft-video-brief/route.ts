import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Hook types for dialing in effective hooks
const HOOK_TYPES = [
  "pattern_interrupt",
  "relatable_pain",
  "proof_teaser",
  "contrarian",
  "social_proof",
  "mini_story",
  "offer_urgency",
] as const;

type HookType = (typeof HOOK_TYPES)[number];

// Tone presets
const TONE_PRESETS = [
  "ugc_casual",
  "funny",
  "serious",
  "fast_paced",
  "soft_sell",
] as const;

type TonePreset = (typeof TONE_PRESETS)[number];

interface DraftVideoBriefResult {
  // Hook Package
  spoken_hook_options: string[];
  selected_spoken_hook: string;
  visual_hook: string;
  on_screen_text_hook_options: string[];
  selected_on_screen_text_hook: string;
  on_screen_text_mid: string[];
  on_screen_text_cta: string;
  // Existing fields
  angle_options: string[];
  selected_angle: string;
  proof_type: "testimonial" | "demo" | "comparison" | "other";
  notes: string;
  broll_ideas: string[];
  script_draft: string;
  // Legacy fields for backwards compatibility
  hook_options: string[];
  selected_hook: string;
  on_screen_text: string[];
}

interface DraftVideoBriefInput {
  product_id: string;
  hook_type?: HookType;
  tone_preset?: TonePreset;
  reference_script_text?: string;
  reference_script_id?: string;
  reference_video_url?: string;
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

// Hook type descriptions for AI prompting
const HOOK_TYPE_DESCRIPTIONS: Record<HookType, string> = {
  pattern_interrupt: "Start with something unexpected that breaks the scroll pattern - a bold statement, surprising action, or jarring visual cue",
  relatable_pain: "Open with a frustration or problem the viewer immediately relates to - 'I was so tired of...' or 'Does this happen to you?'",
  proof_teaser: "Tease incredible results or transformation right away - 'Wait until you see what happened...' or show before/after glimpse",
  contrarian: "Challenge common beliefs or go against the grain - 'Everyone's wrong about...' or 'Stop doing this...'",
  social_proof: "Lead with popularity, virality, or others' experiences - 'Why everyone's buying...' or 'This product went viral because...'",
  mini_story: "Start with a quick personal story setup - 'So yesterday I was...' or 'Let me tell you what happened when...'",
  offer_urgency: "Create immediate FOMO or urgency - 'Last chance to...' or 'They're almost sold out...'",
};

// Tone preset descriptions for AI prompting
const TONE_DESCRIPTIONS: Record<TonePreset, string> = {
  ugc_casual: "Natural, conversational, like talking to a friend. Use 'um', 'like', casual language. Not polished.",
  funny: "Lighthearted, witty, use humor and playful energy. Can be self-deprecating or observational.",
  serious: "Direct, authoritative, no-nonsense. Focus on facts and credibility.",
  fast_paced: "Quick cuts, rapid delivery, high energy. Get to the point fast. Punchy sentences.",
  soft_sell: "Gentle, storytelling approach. Let the product speak for itself. No hard CTAs.",
};

// Deterministic template-based fallback when AI is unavailable
function generateTemplateBrief(
  brand: string,
  productName: string,
  category: string,
  hookType: HookType = "pattern_interrupt",
  tonePreset: TonePreset = "ugc_casual",
  referenceScript?: string
): DraftVideoBriefResult {
  // Hook type-specific templates
  const hookTemplates: Record<HookType, Record<string, string[]>> = {
    pattern_interrupt: {
      supplements: [
        `Stop scrolling - this ${brand} product is different`,
        `Wait. You need to see this about ${productName}`,
        `I never post about supplements but ${productName}...`,
        `POV: You finally found a supplement that works`,
      ],
      default: [
        `Stop what you're doing - ${productName} changed everything`,
        `Wait. Before you scroll, look at this`,
        `I never do this but I have to share ${productName}`,
        `This is the sign you've been waiting for`,
      ],
    },
    relatable_pain: {
      supplements: [
        `Tired of supplements that do nothing? Same.`,
        `Why does every supplement promise the world?`,
        `I was skeptical too until I tried ${productName}`,
        `Does anyone else feel like vitamins never work?`,
      ],
      default: [
        `Does this happen to you too?`,
        `I was so frustrated until I found ${productName}`,
        `Why is it so hard to find something that works?`,
        `If you're struggling with this, watch this`,
      ],
    },
    proof_teaser: {
      supplements: [
        `Watch what happened after 30 days of ${productName}`,
        `The results? I'll show you`,
        `Before ${brand} vs after - you won't believe this`,
        `Here's what nobody tells you about ${productName}`,
      ],
      default: [
        `Wait until you see the results`,
        `I have to show you what this did`,
        `Before and after using ${productName}`,
        `The difference is insane - look`,
      ],
    },
    contrarian: {
      supplements: [
        `Everything you know about supplements is wrong`,
        `Stop taking vitamins the wrong way`,
        `Why most people waste money on supplements`,
        `Your supplement routine is probably broken`,
      ],
      default: [
        `Everyone's doing this wrong`,
        `Unpopular opinion about ${productName}`,
        `Stop listening to influencers about this`,
        `The truth nobody wants to hear`,
      ],
    },
    social_proof: {
      supplements: [
        `Why everyone's switching to ${brand}`,
        `${productName} sold out three times this month`,
        `My followers kept asking about this`,
        `POV: You find out why this went viral`,
      ],
      default: [
        `Why ${productName} is going viral right now`,
        `Everyone's been asking me about this`,
        `This is the #1 thing my followers buy`,
        `Find out why this keeps selling out`,
      ],
    },
    mini_story: {
      supplements: [
        `So I started taking ${productName} and...`,
        `My mom actually recommended ${brand} to me`,
        `Story time: I was at the gym when someone asked...`,
        `Let me tell you how I discovered ${productName}`,
      ],
      default: [
        `So this happened to me yesterday`,
        `Let me tell you about ${productName}`,
        `Story time about how I found this`,
        `My friend told me about ${brand} and I had to try it`,
      ],
    },
    offer_urgency: {
      supplements: [
        `${brand} just dropped a deal - but it ends soon`,
        `Last restock of ${productName} this month`,
        `They're almost sold out again`,
        `Get ${productName} before it's gone`,
      ],
      default: [
        `Running out fast - grab ${productName} now`,
        `This deal ends tonight`,
        `Almost sold out - don't miss this`,
        `Limited stock alert for ${productName}`,
      ],
    },
  };

  const categoryAngles: Record<string, string[]> = {
    supplements: [
      "Daily wellness transformation",
      "Energy & focus benefits",
      "Natural ingredients spotlight",
      "Lifestyle upgrade angle",
    ],
    beauty: [
      "Before/after transformation",
      "Clean beauty spotlight",
      "Effortless glow routine",
      "Confidence boost angle",
    ],
    fitness: [
      "Performance enhancement",
      "Recovery focus",
      "Consistency made easy",
      "Results-driven approach",
    ],
    default: [
      "Problem-solution approach",
      "Quality & value angle",
      "Lifestyle enhancement",
      "Trust & authenticity",
    ],
  };

  const hooks = hookTemplates[hookType][category] || hookTemplates[hookType].default;
  const angles = categoryAngles[category] || categoryAngles.default;

  const proofTypes: Array<"testimonial" | "demo" | "comparison"> = ["testimonial", "demo", "comparison"];
  const proofType = proofTypes[Math.floor(Math.random() * proofTypes.length)];

  // Visual hook based on hook type
  const visualHooks: Record<HookType, string> = {
    pattern_interrupt: `Open on face close-up with surprised expression, then quick cut to ${productName}`,
    relatable_pain: `Start with frustrated expression or dramatic sigh while looking at camera`,
    proof_teaser: `Flash quick glimpse of results/transformation, then cut back to setup`,
    contrarian: `Shake head or make "no" gesture while looking directly at camera`,
    social_proof: `Show phone with comments/DMs asking about the product, or unboxing`,
    mini_story: `Casual setup - sitting on couch or bed, natural lighting, talking to friend`,
    offer_urgency: `Quick product shot with motion/energy, sense of immediacy`,
  };

  // On-screen text hooks
  const textHooks = [
    hooks[0].slice(0, 40) + (hooks[0].length > 40 ? "..." : ""),
    `${brand} ${productName}`.slice(0, 30),
    "You need this",
    "Watch this",
  ];

  // Mid overlays
  const midOverlays = [
    "Here's why...",
    "The difference?",
    "Game changer",
  ];

  // If reference script provided, adjust the script structure
  let scriptDraft = "";
  if (referenceScript && referenceScript.trim()) {
    // Use reference as structural guide
    scriptDraft = `[Based on reference script structure]

${hooks[0]}

${referenceScript.includes("So") || referenceScript.includes("so") ? "So" : "Okay so"} I've been using ${productName} from ${brand} and I have to share this.

${proofType === "testimonial" ? "Here's what I noticed..." : proofType === "demo" ? "Let me show you how I use it..." : "Compared to what I was using before..."}

The quality is actually insane and it's become part of my daily routine.

If you want to try it, link's in my bio - ${brand} is on TikTok Shop!`;
  } else {
    scriptDraft = `${hooks[0]}

${tonePreset === "ugc_casual" ? "Okay so" : tonePreset === "fast_paced" ? "Look." : "So"} I've been using ${productName} from ${brand} and I have to share my experience.

${proofType === "testimonial" ? "Here's what I noticed after using it..." : proofType === "demo" ? "Let me show you how I use it..." : "Compared to what I was using before..."}

The quality is ${tonePreset === "funny" ? "lowkey insane" : tonePreset === "serious" ? "exceptional" : "amazing"} and it's become part of my daily routine.

If you want to try it, check the link - ${brand} is available on TikTok Shop right now!`;
  }

  return {
    // Hook Package
    spoken_hook_options: hooks,
    selected_spoken_hook: hooks[0],
    visual_hook: visualHooks[hookType],
    on_screen_text_hook_options: textHooks,
    selected_on_screen_text_hook: textHooks[0],
    on_screen_text_mid: midOverlays,
    on_screen_text_cta: "Link in bio!",
    // Standard fields
    angle_options: angles,
    selected_angle: angles[0],
    proof_type: proofType,
    notes: `Feature ${productName}'s key benefits. Show authentic usage. Hook type: ${hookType}. Tone: ${tonePreset}.`,
    broll_ideas: [
      `Close-up of ${productName} packaging`,
      "Lifestyle shot using the product",
      "Before/after or reaction moment",
      "Unboxing or first impression",
    ],
    script_draft: scriptDraft,
    // Legacy fields
    hook_options: hooks,
    selected_hook: hooks[0],
    on_screen_text: [textHooks[0], ...midOverlays, "Link in bio!"],
  };
}

/**
 * POST /api/ai/draft-video-brief
 *
 * Generates a complete video brief using AI from Brand + Product.
 * Supports reference scripts, hook types, and tone presets for better results.
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
    hook_type = "pattern_interrupt",
    tone_preset = "ugc_casual",
    reference_script_text,
    reference_script_id,
    reference_video_url,
  } = body as DraftVideoBriefInput;

  // Validate product_id
  if (!product_id || typeof product_id !== "string" || product_id.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "product_id is required", error_code: "VALIDATION_ERROR", correlation_id: correlationId },
      { status: 400 }
    );
  }

  // Validate hook_type
  const validHookType = HOOK_TYPES.includes(hook_type as HookType) ? (hook_type as HookType) : "pattern_interrupt";

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

  // Check for AI API keys
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  // If no AI keys, use template-based fallback
  if (!anthropicKey && !openaiKey) {
    console.log(`[${correlationId}] No AI API key configured, using template fallback`);
    const templateResult = generateTemplateBrief(brand, productName, category, validHookType, validTonePreset, referenceScriptContent);
    return NextResponse.json({
      ok: true,
      data: templateResult,
      meta: {
        product_id: product_id.trim(),
        brand,
        product_name: productName,
        ai_provider: "template_fallback",
        hook_type: validHookType,
        tone_preset: validTonePreset,
        has_reference: !!referenceScriptContent,
      },
      correlation_id: correlationId,
    });
  }

  try {
    // Build the AI prompt
    let prompt = `Generate a complete TikTok Shop video brief for this product:

Brand: ${brand}
Product: ${productName}
Category: ${category}
${productUrl ? `Product URL: ${productUrl}` : ""}
${productNotes ? `Notes: ${productNotes}` : ""}

HOOK TYPE: ${validHookType}
${HOOK_TYPE_DESCRIPTIONS[validHookType]}

TONE: ${validTonePreset}
${TONE_DESCRIPTIONS[validTonePreset]}
`;

    if (referenceScriptContent) {
      prompt += `
REFERENCE SCRIPT (use as structural/tone guidance, reword for this product):
"""
${referenceScriptContent.slice(0, 1000)}
"""
`;
    }

    if (reference_video_url) {
      prompt += `
Reference video URL (use as pacing/style inspiration): ${reference_video_url}
`;
    }

    prompt += `
Generate a JSON object with these EXACT fields:

HOOK PACKAGE:
1. spoken_hook_options: Array of 4 spoken hooks matching the ${validHookType} style (5-12 words each)
2. selected_spoken_hook: Best spoken hook from options
3. visual_hook: 1-2 sentences describing the opening visual/action that matches the hook
4. on_screen_text_hook_options: Array of 4 short text overlays for the hook (max 8 words each)
5. selected_on_screen_text_hook: Best text overlay from options
6. on_screen_text_mid: Array of 2-3 mid-video text overlays
7. on_screen_text_cta: Final CTA text overlay

STANDARD FIELDS:
8. angle_options: Array of 4 marketing angles
9. selected_angle: Best angle from options
10. proof_type: One of "testimonial", "demo", or "comparison"
11. notes: Brief production notes (1-2 sentences)
12. broll_ideas: Array of 4 B-roll shot ideas
13. script_draft: Complete 30-60 second script in ${validTonePreset} tone

Requirements:
- All hooks MUST match the ${validHookType} style
- Script tone MUST match ${validTonePreset}
- For supplements: NO medical claims, avoid "cure", "treat", "diagnose", "guaranteed"
- Keep UGC pacing with short sentences
- Include clear call-to-action for TikTok Shop
${referenceScriptContent ? "- Mirror the structure and pacing of the reference script" : ""}

Return ONLY valid JSON. No markdown. No code fences.`;

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
          max_tokens: 2500,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status}`);
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
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 2500,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
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

    // Validate and sanitize the result with defaults
    const spokenHooks = Array.isArray(aiResult.spoken_hook_options) ? aiResult.spoken_hook_options.slice(0, 5) : [];
    const textHooks = Array.isArray(aiResult.on_screen_text_hook_options) ? aiResult.on_screen_text_hook_options.slice(0, 5) : [];

    const validatedResult: DraftVideoBriefResult = {
      // Hook Package
      spoken_hook_options: spokenHooks.length > 0 ? spokenHooks : (Array.isArray(aiResult.hook_options) ? aiResult.hook_options.slice(0, 5) : []),
      selected_spoken_hook: String(aiResult.selected_spoken_hook || aiResult.selected_hook || spokenHooks[0] || ""),
      visual_hook: String(aiResult.visual_hook || "Open on close-up of face, then reveal product"),
      on_screen_text_hook_options: textHooks.length > 0 ? textHooks : ["Watch this", "You need this", "Game changer", "Link in bio"],
      selected_on_screen_text_hook: String(aiResult.selected_on_screen_text_hook || textHooks[0] || "Watch this"),
      on_screen_text_mid: Array.isArray(aiResult.on_screen_text_mid) ? aiResult.on_screen_text_mid.slice(0, 4) : ["Here's why", "The difference?"],
      on_screen_text_cta: String(aiResult.on_screen_text_cta || "Link in bio!"),
      // Standard fields
      angle_options: Array.isArray(aiResult.angle_options) ? aiResult.angle_options.slice(0, 5) : [],
      selected_angle: String(aiResult.selected_angle || aiResult.angle_options?.[0] || ""),
      proof_type: ["testimonial", "demo", "comparison", "other"].includes(aiResult.proof_type as string)
        ? (aiResult.proof_type as "testimonial" | "demo" | "comparison" | "other")
        : "testimonial",
      notes: String(aiResult.notes || ""),
      broll_ideas: Array.isArray(aiResult.broll_ideas) ? aiResult.broll_ideas.slice(0, 5) : [],
      script_draft: String(aiResult.script_draft || ""),
      // Legacy fields
      hook_options: spokenHooks.length > 0 ? spokenHooks : (Array.isArray(aiResult.hook_options) ? aiResult.hook_options.slice(0, 5) : []),
      selected_hook: String(aiResult.selected_spoken_hook || aiResult.selected_hook || ""),
      on_screen_text: [
        String(aiResult.selected_on_screen_text_hook || textHooks[0] || ""),
        ...(Array.isArray(aiResult.on_screen_text_mid) ? aiResult.on_screen_text_mid : []),
        String(aiResult.on_screen_text_cta || "Link in bio!"),
      ],
    };

    return NextResponse.json({
      ok: true,
      data: validatedResult,
      meta: {
        product_id: product_id.trim(),
        brand,
        product_name: productName,
        ai_provider: aiProvider,
        hook_type: validHookType,
        tone_preset: validTonePreset,
        has_reference: !!referenceScriptContent,
      },
      correlation_id: correlationId,
    });

  } catch (error) {
    console.error(`[${correlationId}] AI draft generation error:`, error);

    // Fallback to template on AI failure
    console.log(`[${correlationId}] Falling back to template generation`);
    const templateResult = generateTemplateBrief(brand, productName, category, validHookType, validTonePreset, referenceScriptContent);

    return NextResponse.json({
      ok: true,
      data: templateResult,
      meta: {
        product_id: product_id.trim(),
        brand,
        product_name: productName,
        ai_provider: "template_fallback",
        ai_error: String(error),
        hook_type: validHookType,
        tone_preset: validTonePreset,
        has_reference: !!referenceScriptContent,
      },
      correlation_id: correlationId,
    });
  }
}
