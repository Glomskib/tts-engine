import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { singleFlight, generateFlightKey, createConflictResponse, SingleFlightConflictError } from "@/lib/single-flight";
import { NextResponse } from "next/server";
import { scoreAndSortHookOptions, type HookScoringContext, type HookScoreResult } from "@/lib/ai/scoreHookOption";
import { getHookFamilyKey, selectDiverseOptions, type ScoredOptionWithFamily } from "@/lib/ai/hookFamily";

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

// Emotional drivers with required distribution (12 total)
const EMOTIONAL_DRIVERS = ["shock", "fear", "curiosity", "insecurity", "fomo"] as const;
type EmotionalDriver = (typeof EMOTIONAL_DRIVERS)[number];

const EMOTIONAL_DRIVER_DISTRIBUTION: Record<EmotionalDriver, number> = {
  shock: 2,
  fear: 2,
  curiosity: 3,
  insecurity: 2,
  fomo: 3,
};

// Emotional driver descriptions for AI prompting
const EMOTIONAL_DRIVER_DESCRIPTIONS: Record<EmotionalDriver, string> = {
  shock: "Pattern interrupt, jarring openings, make them stop scrolling. Bold statements, unexpected reveals.",
  fear: "FOMO adjacent, 'you're missing out' energy, fear of being left behind or making mistakes.",
  curiosity: "Curiosity gap, 'what nobody tells you', open loops that demand closure.",
  insecurity: "Relatable pain, 'am I the only one who...', empathetic struggles viewers deeply relate to.",
  fomo: "Urgency, social proof, 'everyone's doing this', limited time, trending now.",
};

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

// Hook with emotional driver metadata
interface HookWithMeta {
  text: string;
  emotional_driver: EmotionalDriver;
  hook_family: HookFamily;
  edge_push: boolean;
}

// Enhanced output interface
interface DraftVideoBriefResult {
  // Product Display Name (TikTok-safe, max 30 chars)
  product_display_name_options: string[];
  selected_product_display_name: string;

  // Hook Package (expanded)
  spoken_hook_options: string[];
  spoken_hook_by_family: Record<string, string[]>;
  hooks_by_emotional_driver: Record<EmotionalDriver, HookWithMeta[]>;
  hook_scores: Record<string, HookScore>;
  selected_spoken_hook: string;
  selected_emotional_driver: EmotionalDriver | null;
  has_edge_push: boolean;

  // Visual hooks (multiple options now)
  visual_hook_options: string[];
  selected_visual_hook: string;
  visual_hook: string; // Legacy alias

  // On-screen text options
  on_screen_text_hook_options: string[];
  selected_on_screen_text_hook: string;
  mid_overlays: string[];

  // CTA Script Line (persuasive, 1-2 sentences for script body)
  cta_script_options: string[];
  selected_cta_script: string;

  // CTA Overlay (mechanical action only, 2-6 words)
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

// Parse result with diagnostic info
interface ParseResult {
  success: boolean;
  data: Partial<DraftVideoBriefResult> | null;
  strategy: string;
  error?: string;
  raw_excerpt?: string;
}

/**
 * Safe JSON parser with multiple extraction strategies
 * Returns detailed diagnostic info on failure
 */
function safeParseJSON(content: string): ParseResult {
  const rawExcerpt = content.slice(0, 2000);

  // Strategy 1: Direct JSON parse
  try {
    const parsed = JSON.parse(content);
    return { success: true, data: parsed, strategy: "direct" };
  } catch (error) {
    console.log(`Direct JSON parse failed: ${error}`);
  }

  // Strategy 2: Extract from ```json code block
  try {
    const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)```/);
    if (jsonBlockMatch && jsonBlockMatch[1]) {
      const parsed = JSON.parse(jsonBlockMatch[1].trim());
      return { success: true, data: parsed, strategy: "json_code_block" };
    }
  } catch (error) {
    console.log(`JSON code block extraction failed: ${error}`);
  }

  // Strategy 3: Extract from generic ``` code block
  try {
    const codeBlockMatch = content.match(/```\s*([\s\S]*?)```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      const blockContent = codeBlockMatch[1].trim();
      // Only try if it looks like JSON (starts with { or [)
      if (blockContent.startsWith("{") || blockContent.startsWith("[")) {
        const parsed = JSON.parse(blockContent);
        return { success: true, data: parsed, strategy: "generic_code_block" };
      }
    }
  } catch (error) {
    console.log(`Generic code block extraction failed: ${error}`);
  }

  // Strategy 4: Find first { and last } and extract
  try {
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      let jsonSubstring = content.substring(firstBrace, lastBrace + 1);

      // Try direct parse first
      try {
        const parsed = JSON.parse(jsonSubstring);
        return { success: true, data: parsed, strategy: "brace_extract" };
      } catch {
        // Continue to repair
      }

      // Strategy 5: Repair common issues in extracted JSON
      // Remove control characters inside strings
      jsonSubstring = jsonSubstring.replace(
        /"([^"\\]*(\\.[^"\\]*)*)"/g,
        (match, innerContent) => {
          let fixed = innerContent;
          fixed = fixed.replace(/\n/g, "\\n");
          fixed = fixed.replace(/\r/g, "\\r");
          fixed = fixed.replace(/\t/g, "\\t");
          fixed = fixed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
          return `"${fixed}"`;
        }
      );

      // Try parsing repaired JSON
      const parsed = JSON.parse(jsonSubstring);
      return { success: true, data: parsed, strategy: "brace_extract_repaired" };
    }
  } catch (error) {
    console.log(`Brace extraction failed: ${error}`);
  }

  // Strategy 5.5: Fix trailing commas (common AI error)
  try {
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      let jsonSubstring = content.substring(firstBrace, lastBrace + 1);

      // Remove trailing commas before } or ]
      jsonSubstring = jsonSubstring.replace(/,(\s*[}\]])/g, "$1");

      // Fix unescaped quotes in strings (common issue)
      // This is a simplified fix - replace straight quotes after alphanumeric with escaped
      jsonSubstring = jsonSubstring.replace(/([a-zA-Z0-9])"([a-zA-Z])/g, '$1\\"$2');

      const parsed = JSON.parse(jsonSubstring);
      return { success: true, data: parsed, strategy: "trailing_comma_fix" };
    }
  } catch (error) {
    console.log(`Trailing comma fix failed: ${error}`);
  }

  // Strategy 6: Try to find any JSON object pattern
  try {
    // Look for patterns like {"key": or {'key':
    const jsonPattern = /\{[\s\S]*"[^"]+"\s*:/;
    if (jsonPattern.test(content)) {
      // Try to balance braces manually
      let depth = 0;
      let startIdx = -1;
      let endIdx = -1;

      for (let i = 0; i < content.length; i++) {
        if (content[i] === "{") {
          if (depth === 0) startIdx = i;
          depth++;
        } else if (content[i] === "}") {
          depth--;
          if (depth === 0 && startIdx !== -1) {
            endIdx = i;
            break;
          }
        }
      }

      if (startIdx !== -1 && endIdx !== -1) {
        const extracted = content.substring(startIdx, endIdx + 1);
        const parsed = JSON.parse(extracted);
        return { success: true, data: parsed, strategy: "balanced_braces" };
      }
    }
  } catch (error) {
    console.log(`Balanced brace extraction failed: ${error}`);
  }

  // All strategies failed
  return {
    success: false,
    data: null,
    strategy: "failed",
    error: "All JSON extraction strategies failed",
    raw_excerpt: rawExcerpt,
  };
}

/**
 * Build fallback result with empty but valid structure
 */
function buildFallbackResult(productName: string, brand: string): DraftVideoBriefResult {
  const fallbackHook = `Check out ${productName} from ${brand}`;
  return {
    product_display_name_options: [productName.slice(0, 30)],
    selected_product_display_name: productName.slice(0, 30),
    spoken_hook_options: [fallbackHook],
    spoken_hook_by_family: {},
    hooks_by_emotional_driver: { shock: [], fear: [], curiosity: [], insecurity: [], fomo: [] },
    hook_scores: {},
    selected_spoken_hook: fallbackHook,
    selected_emotional_driver: null,
    has_edge_push: false,
    visual_hook_options: ["Open on product close-up"],
    selected_visual_hook: "Open on product close-up",
    visual_hook: "Open on product close-up",
    on_screen_text_hook_options: ["Must see"],
    selected_on_screen_text_hook: "Must see",
    mid_overlays: ["Watch this", "Real talk"],
    cta_script_options: ["Link in my bio if you want to try it!"],
    selected_cta_script: "Link in my bio if you want to try it!",
    cta_overlay_options: ["Link in bio", "Tap the cart"],
    selected_cta_overlay: "Link in bio",
    on_screen_text_mid: ["Watch this"],
    on_screen_text_cta: "Link in bio",
    angle_options: ["Personal story"],
    selected_angle: "Personal story",
    proof_type: "testimonial",
    notes: "",
    broll_ideas: ["Product unboxing", "Using the product"],
    script_draft: `${fallbackHook}\n\nI've been using ${productName} and wanted to share my thoughts.\n\nLink in my bio!`,
    hook_options: [fallbackHook],
    selected_hook: fallbackHook,
    on_screen_text: ["Must see", "Watch this", "Link in bio"],
  };
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
 * Fetch banned hooks for this brand/product
 */
async function getBannedHooksForBrand(brandName: string, productId?: string): Promise<string[]> {
  try {
    let query = supabaseAdmin
      .from("ai_hook_feedback")
      .select("hook_text")
      .eq("brand_name", brandName)
      .eq("rating", -1); // Banned hooks only

    // Include product-specific and brand-wide bans
    if (productId) {
      query = query.or(`product_id.eq.${productId},product_id.is.null`);
    }

    const { data } = await query.limit(50);

    if (!data) return [];
    return data.map((row) => row.hook_text);
  } catch (error) {
    console.error("Failed to fetch banned hooks:", error);
    return [];
  }
}

interface ProvenHook {
  hook_type: string;
  hook_text: string;
  hook_family: string | null;
  approved_count: number;
  posted_count: number;
  winner_count: number;
  underperform_count?: number;
  rejected_count?: number;
  used_count?: number;
  created_at?: string | null;
  updated_at?: string | null;
}

interface WeakHook {
  hook_text: string;
  hook_type: string;
  hook_family: string | null;
  underperform_count: number;
  reason_codes: string[];
}

interface RejectedHook {
  hook_text: string;
  hook_type: string;
  hook_family: string | null;
  rejected_count: number;
  reason_codes: string[];
}

interface WeakPatternSummary {
  reason_code: string;
  count: number;
}

/**
 * Fetch rejected hooks for this brand/product (hard exclude)
 */
async function getRejectedHooksForProduct(brandName: string, productId?: string): Promise<RejectedHook[]> {
  try {
    let query = supabaseAdmin
      .from("proven_hooks")
      .select("id, hook_text, hook_type, hook_family, rejected_count")
      .eq("brand_name", brandName)
      .gte("rejected_count", 1)
      .order("rejected_count", { ascending: false })
      .limit(20);

    if (productId) {
      query = query.eq("product_id", productId);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    // Also fetch reason codes from hook_feedback for these hooks
    const hookIds = data.map(h => h.id);
    const { data: feedbackData } = await supabaseAdmin
      .from("hook_feedback")
      .select("hook_id, reason_code")
      .eq("outcome", "rejected")
      .in("hook_id", hookIds)
      .not("reason_code", "is", null)
      .limit(100);

    // Group reason codes by hook id
    const reasonsByHookId: Record<string, string[]> = {};
    if (feedbackData) {
      for (const fb of feedbackData) {
        if (fb.hook_id && fb.reason_code) {
          if (!reasonsByHookId[fb.hook_id]) reasonsByHookId[fb.hook_id] = [];
          if (!reasonsByHookId[fb.hook_id].includes(fb.reason_code)) {
            reasonsByHookId[fb.hook_id].push(fb.reason_code);
          }
        }
      }
    }

    return data.map(h => ({
      hook_text: h.hook_text,
      hook_type: h.hook_type,
      hook_family: h.hook_family,
      rejected_count: h.rejected_count,
      reason_codes: reasonsByHookId[h.id] || [],
    }));
  } catch (error) {
    console.error("Failed to fetch rejected hooks:", error);
    return [];
  }
}

/**
 * Fetch underperforming hooks for this brand/product (soft penalize)
 */
async function getWeakHooksForProduct(brandName: string, productId?: string): Promise<WeakHook[]> {
  try {
    let query = supabaseAdmin
      .from("proven_hooks")
      .select("id, hook_text, hook_type, hook_family, underperform_count")
      .eq("brand_name", brandName)
      .gte("underperform_count", 1)
      .lt("rejected_count", 3) // Not quarantined
      .order("underperform_count", { ascending: false })
      .limit(20);

    if (productId) {
      query = query.eq("product_id", productId);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    // Also fetch reason codes from hook_feedback for these hooks
    const hookIds = data.map(h => h.id);
    const { data: feedbackData } = await supabaseAdmin
      .from("hook_feedback")
      .select("hook_id, reason_code")
      .eq("outcome", "underperform")
      .in("hook_id", hookIds)
      .not("reason_code", "is", null)
      .limit(100);

    // Group reason codes by hook id
    const reasonsByHookId: Record<string, string[]> = {};
    if (feedbackData) {
      for (const fb of feedbackData) {
        if (fb.hook_id && fb.reason_code) {
          if (!reasonsByHookId[fb.hook_id]) reasonsByHookId[fb.hook_id] = [];
          if (!reasonsByHookId[fb.hook_id].includes(fb.reason_code)) {
            reasonsByHookId[fb.hook_id].push(fb.reason_code);
          }
        }
      }
    }

    return data.map(h => ({
      hook_text: h.hook_text,
      hook_type: h.hook_type,
      hook_family: h.hook_family,
      underperform_count: h.underperform_count || 0,
      reason_codes: reasonsByHookId[h.id] || [],
    }));
  } catch (error) {
    console.error("Failed to fetch weak hooks:", error);
    return [];
  }
}

/**
 * Get summary of weak patterns by reason code
 */
async function getWeakPatternsSummary(brandName: string, productId?: string): Promise<WeakPatternSummary[]> {
  try {
    let query = supabaseAdmin
      .from("hook_feedback")
      .select("reason_code")
      .eq("brand_name", brandName)
      .eq("outcome", "underperform")
      .not("reason_code", "is", null);

    if (productId) {
      query = query.eq("product_id", productId);
    }

    const { data, error } = await query.limit(200);
    if (error || !data) return [];

    // Count by reason code
    const counts: Record<string, number> = {};
    for (const row of data) {
      if (row.reason_code) {
        counts[row.reason_code] = (counts[row.reason_code] || 0) + 1;
      }
    }

    return Object.entries(counts)
      .map(([reason_code, count]) => ({ reason_code, count }))
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error("Failed to fetch weak patterns summary:", error);
    return [];
  }
}

/**
 * Fetch proven hooks for this brand (hooks that have been approved/posted/won)
 */
async function getProvenHooksForBrand(brandName: string, productId?: string): Promise<ProvenHook[]> {
  try {
    // Try to fetch from proven_hooks table
    let query = supabaseAdmin
      .from("proven_hooks")
      .select("hook_type, hook_text, hook_family, approved_count, posted_count, winner_count, underperform_count, rejected_count, used_count, created_at, updated_at")
      .eq("brand_name", brandName)
      .gte("approved_count", 1) // At least 1 approval
      .order("winner_count", { ascending: false })
      .order("posted_count", { ascending: false })
      .order("approved_count", { ascending: false })
      .limit(20);

    // Prefer product-specific hooks if available
    if (productId) {
      query = query.eq("product_id", productId);
    }

    const { data, error } = await query;

    if (error) {
      // Table might not exist yet
      console.log("proven_hooks table may not exist yet:", error.code);
      return [];
    }

    return (data || []) as ProvenHook[];
  } catch (error) {
    console.error("Failed to fetch proven hooks:", error);
    return [];
  }
}

interface WinnersBankExtract {
  hook: string;
  hook_family: string;
  cta: string;
  structure: string[];
  quality: number;
}

/**
 * Fetch Winners Bank context for AI generation
 */
async function getWinnersBankContext(category?: string, limit: number = 5): Promise<WinnersBankExtract[]> {
  try {
    let query = supabaseAdmin
      .from("reference_extracts")
      .select(`
        spoken_hook,
        hook_family,
        cta,
        structure_tags,
        quality_score,
        reference_videos!inner (
          category,
          status
        )
      `)
      .eq("reference_videos.status", "ready")
      .order("quality_score", { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq("reference_videos.category", category);
    }

    const { data, error } = await query;

    if (error) {
      console.log("reference_extracts table may not exist yet:", error.code);
      return [];
    }

    return (data || []).map((extract) => ({
      hook: extract.spoken_hook || "",
      hook_family: extract.hook_family || "",
      cta: extract.cta || "",
      structure: Array.isArray(extract.structure_tags) ? extract.structure_tags : [],
      quality: extract.quality_score || 0,
    }));
  } catch (error) {
    console.error("Failed to fetch Winners Bank context:", error);
    return [];
  }
}

/**
 * Log an AI generation run to the database
 */
interface GenerationDebugContext {
  winners_used: number;
  rejected_avoided: number;
  weak_avoided: number;
  weak_patterns: WeakPatternSummary[];
  rejected_hooks_sample: string[];
  weak_hooks_sample: string[];
}

async function logGenerationRun(params: {
  productId: string;
  nonce: string;
  hookType: string;
  tonePreset: string;
  targetLength: string;
  output: DraftVideoBriefResult;
  aiProvider: string;
  correlationId: string;
  debugContext?: GenerationDebugContext;
}): Promise<void> {
  try {
    await supabaseAdmin.from("ai_generation_runs").insert({
      product_id: params.productId,
      nonce: params.nonce,
      prompt_version: "v2",
      hook_type: params.hookType,
      tone_preset: params.tonePreset,
      target_length: params.targetLength,
      output_json: {
        ...params.output,
        _debug: params.debugContext || null, // Store debug info in output_json
      },
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
  bannedHooks: string[];
  provenHooks: ProvenHook[];
  winnersBank: WinnersBankExtract[];
  rejectedHooks: RejectedHook[];
  weakHooks: WeakHook[];
  weakPatternsSummary: WeakPatternSummary[];
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
    bannedHooks,
    provenHooks,
    winnersBank,
    rejectedHooks,
    weakHooks,
    weakPatternsSummary,
    nonce,
  } = params;

  // STRICT JSON-ONLY INSTRUCTIONS (placed at START for maximum compliance)
  let prompt = `You are a JSON-only response API. Your ENTIRE response must be a single valid JSON object.

CRITICAL OUTPUT RULES:
1. Output ONLY raw JSON - no markdown, no code fences, no explanatory text
2. Do NOT wrap JSON in \`\`\`json or \`\`\` blocks
3. Do NOT include any text before or after the JSON object
4. Ensure all strings are properly escaped (use \\" for quotes inside strings)
5. Use double quotes for all keys and string values
6. No trailing commas in arrays or objects

REQUIRED JSON SCHEMA (all fields required):
{
  "spoken_hook_options": string[],           // Array of 12 unique hooks (5-15 words each)
  "hooks_by_emotional_driver": {             // Hooks grouped by driver
    "shock": [{ "text": string, "emotional_driver": "shock", "hook_family": string, "edge_push": boolean }],
    "fear": [{ "text": string, "emotional_driver": "fear", "hook_family": string, "edge_push": boolean }],
    "curiosity": [{ "text": string, "emotional_driver": "curiosity", "hook_family": string, "edge_push": boolean }],
    "insecurity": [{ "text": string, "emotional_driver": "insecurity", "hook_family": string, "edge_push": boolean }],
    "fomo": [{ "text": string, "emotional_driver": "fomo", "hook_family": string, "edge_push": boolean }]
  },
  "hook_scores": { [hookText: string]: { "curiosity": number, "clarity": number, "ugc_fit": number, "overall": number } },
  "selected_spoken_hook": string,
  "selected_emotional_driver": string,
  "visual_hook_options": string[],           // Array of 6 visual directions
  "selected_visual_hook": string,
  "product_display_name_options": string[],  // Array of 5 product names (max 30 chars)
  "selected_product_display_name": string,
  "on_screen_text_hook_options": string[],   // Array of 10 text overlays (max 6 words)
  "selected_on_screen_text_hook": string,
  "mid_overlays": string[],                  // Array of 6 mid-video overlays
  "cta_script_options": string[],            // Array of 5 persuasive CTAs
  "selected_cta_script": string,
  "cta_overlay_options": string[],           // Array of 5 mechanical CTAs
  "selected_cta_overlay": string,
  "angle_options": string[],                 // Array of 4 marketing angles
  "selected_angle": string,
  "proof_type": "testimonial" | "demo" | "comparison",
  "notes": string,
  "broll_ideas": string[],                   // Array of 4 B-roll ideas
  "script_draft": string
}

VALIDATION: Before outputting, verify your JSON includes ALL keys listed above. Missing keys will cause a parse error.

---

Generation ID: ${nonce}
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

  // User-banned hooks (from feedback)
  if (bannedHooks.length > 0) {
    prompt += `USER-BANNED HOOKS - DO NOT USE OR PARAPHRASE THESE:
${bannedHooks.slice(0, 30).map(h => `- "${h}"`).join("\n")}

`;
  }

  // REJECTED HOOKS - hard exclude (do not reuse structure or phrasing)
  if (rejectedHooks.length > 0) {
    prompt += `REJECTED HOOKS - DO NOT REUSE THESE OR THEIR STRUCTURE:
These hooks failed quality review. Avoid their patterns entirely.
${rejectedHooks.slice(0, 15).map(h => {
  const reasons = h.reason_codes.length > 0 ? ` (Reason: ${h.reason_codes.join(", ")})` : "";
  return `- [${h.hook_type}] "${h.hook_text}"${reasons}`;
}).join("\n")}

`;
  }

  // WEAK/UNDERPERFORMING HOOKS - soft penalize (avoid similar approaches)
  if (weakHooks.length > 0) {
    prompt += `UNDERPERFORMING HOOKS - AVOID SIMILAR APPROACHES:
These hooks didn't perform well. If you use similar patterns, significantly change the wording and emotional framing.
${weakHooks.slice(0, 15).map(h => {
  const reasons = h.reason_codes.length > 0 ? ` (Issues: ${h.reason_codes.join(", ")})` : "";
  return `- [${h.hook_type}${h.hook_family ? `/${h.hook_family}` : ""}] "${h.hook_text}"${reasons} (weak x${h.underperform_count})`;
}).join("\n")}

`;
  }

  // WEAK PATTERNS SUMMARY - adjust generation strategy based on feedback
  if (weakPatternsSummary.length > 0) {
    prompt += `WEAK PATTERN ANALYSIS - ADJUST YOUR APPROACH:
Based on feedback, these patterns have underperformed:
${weakPatternsSummary.slice(0, 6).map(p => `- ${p.reason_code}: ${p.count} occurrences`).join("\n")}

ADAPTATION RULES:
`;
    // Add specific adaptation rules based on weak patterns
    for (const pattern of weakPatternsSummary.slice(0, 4)) {
      switch (pattern.reason_code) {
        case "weak_cta":
          prompt += `- HIGH "weak_cta" feedback: Generate STRONGER CTAs with cart-click urgency and benefit-driven language. Be specific about what they get.\n`;
          break;
        case "too_generic":
          prompt += `- HIGH "too_generic" feedback: Force SPECIFICITY - use persona language, concrete situations, and one clear pain point. No vague claims.\n`;
          break;
        case "low_engagement":
          prompt += `- HIGH "low_engagement" feedback: Open with more PATTERN INTERRUPTS - unexpected statements, controversy, or direct questions.\n`;
          break;
        case "wrong_tone":
          prompt += `- HIGH "wrong_tone" feedback: Match the audience better - more relatable, less salesy, more authentic UGC energy.\n`;
          break;
        case "poor_timing":
          prompt += `- HIGH "poor_timing" feedback: Front-load the hook impact in the first 2 seconds. Get to the point faster.\n`;
          break;
        case "saturated":
          prompt += `- HIGH "saturated" feedback: Avoid overused patterns. Try contrarian angles or unexpected emotional drivers.\n`;
          break;
      }
    }
    prompt += `
`;
  }

  // Include proven hooks as inspiration (high performers from this brand)
  if (provenHooks.length > 0) {
    const winnerHooks = provenHooks.filter(h => h.winner_count > 0);
    const postedHooks = provenHooks.filter(h => h.posted_count > 0 && h.winner_count === 0);
    const approvedHooks = provenHooks.filter(h => h.approved_count > 0 && h.posted_count === 0);

    prompt += `PROVEN HIGH-PERFORMING HOOKS - Use these as STYLE INSPIRATION (create variations, not copies):
`;
    if (winnerHooks.length > 0) {
      prompt += `
WINNER HOOKS (got best engagement - create similar styles):
${winnerHooks.slice(0, 5).map(h => `- [${h.hook_type}${h.hook_family ? `/${h.hook_family}` : ''}] "${h.hook_text}"`).join("\n")}
`;
    }
    if (postedHooks.length > 0) {
      prompt += `
POSTED HOOKS (made it to platform - proven formats):
${postedHooks.slice(0, 5).map(h => `- [${h.hook_type}${h.hook_family ? `/${h.hook_family}` : ''}] "${h.hook_text}"`).join("\n")}
`;
    }
    if (approvedHooks.length > 0) {
      prompt += `
APPROVED HOOKS (passed review - good quality):
${approvedHooks.slice(0, 3).map(h => `- [${h.hook_type}${h.hook_family ? `/${h.hook_family}` : ''}] "${h.hook_text}"`).join("\n")}
`;
    }
    prompt += `
IMPORTANT: Create NEW hooks inspired by the successful patterns above. Don't copy verbatim.

`;
  }

  // Include Winners Bank reference extracts for style inspiration
  if (winnersBank.length > 0) {
    prompt += `WINNERS BANK - High-performing hooks from viral TikToks (use as STYLE REFERENCE):
`;
    for (const winner of winnersBank) {
      prompt += `- [${winner.hook_family}] "${winner.hook}" (quality: ${winner.quality}/100)
  CTA: "${winner.cta}" | Structure: ${winner.structure.join(", ")}
`;
    }
    prompt += `
Use the Winners Bank as a guide for what resonates. Create ORIGINAL hooks with similar energy and patterns.

`;
  }

  // Output specification with emotional driver distribution
  // CRITICAL: Enforce exact distribution for consistent A/B testing
  const hookDistribution = `SPOKEN HOOKS (EXACTLY 12, with REQUIRED emotional driver distribution):

EMOTIONAL DRIVER DISTRIBUTION (must match EXACTLY):
- shock: 2 hooks - ${EMOTIONAL_DRIVER_DESCRIPTIONS.shock}
- fear: 2 hooks - ${EMOTIONAL_DRIVER_DESCRIPTIONS.fear}
- curiosity: 3 hooks - ${EMOTIONAL_DRIVER_DESCRIPTIONS.curiosity}
- insecurity: 2 hooks - ${EMOTIONAL_DRIVER_DESCRIPTIONS.insecurity}
- fomo: 3 hooks - ${EMOTIONAL_DRIVER_DESCRIPTIONS.fomo}

EDGE PUSH REQUIREMENT:
At least ONE hook must be "edge_push": true (pushes boundaries, slightly controversial, bold statement)
Typically shock or fear hooks work best for edge_push.

1. spoken_hook_options: Array of EXACTLY 12 unique spoken hooks (5-15 words each)`;

  prompt += `Generate a JSON object with these EXACT fields:

${hookDistribution}

2. hooks_by_emotional_driver: Object with hook details grouped by driver:
   {
     "shock": [
       { "text": "hook text", "emotional_driver": "shock", "hook_family": "pattern_interrupt", "edge_push": true },
       { "text": "hook text", "emotional_driver": "shock", "hook_family": "contrarian", "edge_push": false }
     ],
     "fear": [
       { "text": "hook text", "emotional_driver": "fear", "hook_family": "relatable_pain", "edge_push": false },
       { "text": "hook text", "emotional_driver": "fear", "hook_family": "curiosity_gap", "edge_push": false }
     ],
     "curiosity": [
       { "text": "hook text", "emotional_driver": "curiosity", "hook_family": "curiosity_gap", "edge_push": false },
       { "text": "hook text", "emotional_driver": "curiosity", "hook_family": "proof_teaser", "edge_push": false },
       { "text": "hook text", "emotional_driver": "curiosity", "hook_family": "mini_story", "edge_push": false }
     ],
     "insecurity": [
       { "text": "hook text", "emotional_driver": "insecurity", "hook_family": "relatable_pain", "edge_push": false },
       { "text": "hook text", "emotional_driver": "insecurity", "hook_family": "contrarian", "edge_push": false }
     ],
     "fomo": [
       { "text": "hook text", "emotional_driver": "fomo", "hook_family": "proof_teaser", "edge_push": false },
       { "text": "hook text", "emotional_driver": "fomo", "hook_family": "mini_story", "edge_push": false },
       { "text": "hook text", "emotional_driver": "fomo", "hook_family": "pattern_interrupt", "edge_push": false }
     ]
   }
   IMPORTANT: At least one hook across all drivers must have "edge_push": true

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
5. selected_emotional_driver: The emotional_driver of the selected hook

VISUAL HOOKS (6 options):
5. visual_hook_options: Array of 6 opening shot directions (1-2 sentences each)
6. selected_visual_hook: Best visual hook from options

PRODUCT DISPLAY NAME (TikTok-safe product naming):
7. product_display_name_options: Array of 5 short product names (max 30 chars each)
   - Letters, numbers, spaces only
   - NO emojis, special characters, prices, or medical claims
   - Clear and scroll-stopping
   - NOT a CTA or hook - just a clean product reference
8. selected_product_display_name: Best product display name

ON-SCREEN TEXT:
9. on_screen_text_hook_options: Array of 10 text overlays (max 6 words each, minimal punctuation)
10. selected_on_screen_text_hook: Best text overlay
11. mid_overlays: Array of 6 mid-video overlays (2-4 words each)

CTA SCRIPT LINE (persuasive copy for script body):
12. cta_script_options: Array of 5 persuasive CTA sentences (1-2 sentences each)
    - Use urgency, scarcity, popularity ("selling out", "high demand", "blowing up")
    - Can mention "up to X% off" but NO exact prices
    - NO medical claims or guarantees
    - This goes IN the script, not the overlay
13. selected_cta_script: Best CTA script line

CTA OVERLAY (mechanical action only - final seconds):
14. cta_overlay_options: Array of 5 mechanical CTAs (2-6 words max)
    - ONLY the action: "Tap the orange cart", "Link in bio", "Shop it here"
    - NO hype, NO product names, NO benefits
    - Simple instruction for viewer action
15. selected_cta_overlay: Best CTA overlay

STANDARD FIELDS:
16. angle_options: Array of 4 marketing angles
17. selected_angle: Best angle
18. proof_type: "testimonial", "demo", or "comparison"
19. notes: Production notes (1-2 sentences)
20. broll_ideas: Array of 4 B-roll shot ideas
21. script_draft: Complete ${targetLength} script in ${tonePreset} tone
    - Include the selected_cta_script near the end of the script body

REQUIREMENTS:
- Every hook must be UNIQUE and FRESH
- NO banned phrases
- For supplements: NO medical claims (avoid "cure", "treat", "diagnose", "guaranteed")
- Hooks should feel natural for UGC/TikTok
- Scores should be honest - don't give everything 10/10
- Text overlays: SHORT, punchy, no excessive punctuation
- product_display_name: Clean product reference only (max 30 chars)
- cta_script: Persuasive copy with urgency (for script body)
- cta_overlay: Mechanical action only (for final overlay)

REMINDER: Output ONLY the raw JSON object. No markdown, no code fences, no explanatory text.`;

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
    // Product Display Name
    product_display_name_options: original.product_display_name_options || [productName.slice(0, 30)],
    selected_product_display_name: original.selected_product_display_name || productName.slice(0, 30),

    spoken_hook_options: original.spoken_hook_options || [],
    spoken_hook_by_family: original.spoken_hook_by_family || {},
    hooks_by_emotional_driver: original.hooks_by_emotional_driver || { shock: [], fear: [], curiosity: [], insecurity: [], fomo: [] },
    hook_scores: original.hook_scores || {},
    selected_spoken_hook: original.selected_spoken_hook || "",
    selected_emotional_driver: original.selected_emotional_driver || null,
    has_edge_push: original.has_edge_push || false,
    visual_hook_options: original.visual_hook_options || [],
    selected_visual_hook: original.selected_visual_hook || original.visual_hook || "",
    visual_hook: original.visual_hook || "",
    on_screen_text_hook_options: original.on_screen_text_hook_options || [],
    selected_on_screen_text_hook: original.selected_on_screen_text_hook || "",
    mid_overlays: original.mid_overlays || original.on_screen_text_mid || [],

    // CTA Script Line (persuasive)
    cta_script_options: original.cta_script_options || ["This is selling out fast - grab yours!", "Everyone's talking about this!", "High demand - tap the cart!"],
    selected_cta_script: original.selected_cta_script || "This is selling out fast - grab yours!",

    // CTA Overlay (mechanical action only)
    cta_overlay_options: original.cta_overlay_options || ["Tap the orange cart", "Link in bio", "Shop it here"],
    selected_cta_overlay: original.selected_cta_overlay || original.on_screen_text_cta || "Tap the orange cart",
    on_screen_text_mid: original.on_screen_text_mid || [],
    on_screen_text_cta: original.on_screen_text_cta || "Tap the orange cart",
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

  // CTA Script Line based on tone (persuasive, for script body)
  if (!isLocked("ctaScript")) {
    if (tonePreset === "soft_sell") {
      result.selected_cta_script = "If you're curious, the link is in my bio - no pressure!";
      result.cta_script_options = [
        "If you're curious, the link is in my bio - no pressure!",
        "I'll leave the link below if you want to check it out",
        "Just thought I'd share in case anyone else needed this",
      ];
    } else if (tonePreset === "fast_paced") {
      result.selected_cta_script = "This is blowing up right now - tap the cart before it sells out!";
      result.cta_script_options = [
        "This is blowing up right now - tap the cart before it sells out!",
        "High demand alert - grab yours NOW!",
        "Everyone's adding this to cart - don't miss out!",
      ];
    } else {
      result.selected_cta_script = "This is selling out fast - link's in my bio!";
      result.cta_script_options = [
        "This is selling out fast - link's in my bio!",
        "Seriously, grab this before it's gone!",
        "Trust me, you need this - link below!",
      ];
    }
  }

  // CTA Overlay based on tone (mechanical action only, 2-6 words)
  if (!isLocked("onScreenTextCta")) {
    if (tonePreset === "soft_sell") {
      result.selected_cta_overlay = "Link in bio";
      result.cta_overlay_options = ["Link in bio", "Check it out", "Details below", "Tap to learn more", "Bio link"];
    } else if (tonePreset === "fast_paced") {
      result.selected_cta_overlay = "Tap the cart NOW";
      result.cta_overlay_options = ["Tap the cart NOW", "Shop it", "Get it fast", "Tap here", "Go go go"];
    } else {
      result.selected_cta_overlay = "Tap the orange cart";
      result.cta_overlay_options = ["Tap the orange cart", "Link in bio", "Shop it here", "Tap to shop", "Get yours"];
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
  const url = new URL(request.url);
  const debugMode = url.searchParams.get("debug") === "1" || process.env.DEBUG_AI === "1";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
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
    return createApiErrorResponse("VALIDATION_ERROR", "product_id is required", 400, correlationId);
  }

  // Single-flight: prevent concurrent generations for the same product
  // Only apply to "generate" mode (not "readjust" which is quick)
  const flightKey = mode === "generate" ? generateFlightKey("ai-brief", product_id.trim()) : null;

  // Validate tone_preset
  const validTonePreset = TONE_PRESETS.includes(tone_preset as TonePreset) ? (tone_preset as TonePreset) : "ugc_casual";

  // Fetch product with brand info (outside single-flight - quick lookup)
  const { data: product, error: productError } = await supabaseAdmin
    .from("products")
    .select("id, name, brand, category, primary_link, notes")
    .eq("id", product_id.trim())
    .single();

  if (productError || !product) {
    return createApiErrorResponse("NOT_FOUND", "Product not found", 404, correlationId, { product_id: product_id.trim() });
  }

  // Single-flight wrapper for AI generation
  // This prevents duplicate AI calls when users rapidly click "regenerate"
  if (flightKey) {
    try {
      const { result, primary } = await singleFlight(flightKey, async () => {
        return await executeAIGeneration({
          correlationId,
          debugMode,
          product,
          product_id: product_id.trim(),
          hook_type,
          validTonePreset,
          target_length,
          reference_script_text,
          reference_script_id,
          reference_video_url,
          nonce,
          mode,
          locked_fields,
          original_ai_draft,
          current_state,
        });
      });

      if (!primary) {
        console.log(`[${correlationId}] Returned deduped result for product ${product_id}`);
      }
      return result;
    } catch (error) {
      if (error instanceof SingleFlightConflictError) {
        return createConflictResponse(correlationId, "product");
      }
      throw error;
    }
  }

  // No single-flight (readjust mode or no key) - execute directly
  return await executeAIGeneration({
    correlationId,
    debugMode,
    product,
    product_id: product_id.trim(),
    hook_type,
    validTonePreset,
    target_length,
    reference_script_text,
    reference_script_id,
    reference_video_url,
    nonce,
    mode,
    locked_fields,
    original_ai_draft,
    current_state,
  });
}

// Extracted AI generation logic
interface ExecuteAIGenerationParams {
  correlationId: string;
  debugMode: boolean;
  product: {
    id: string;
    name: string;
    brand: string | null;
    category: string | null;
    primary_link: string | null;
    notes: string | null;
  };
  product_id: string;
  hook_type: string;
  validTonePreset: TonePreset;
  target_length: string;
  reference_script_text?: string;
  reference_script_id?: string;
  reference_video_url?: string;
  nonce: string;
  mode: string;
  locked_fields: string[];
  original_ai_draft?: Partial<DraftVideoBriefResult>;
  current_state?: DraftVideoBriefInput["current_state"];
}

async function executeAIGeneration(params: ExecuteAIGenerationParams): Promise<NextResponse> {
  const {
    correlationId,
    debugMode,
    product,
    product_id,
    hook_type,
    validTonePreset,
    target_length,
    reference_script_text,
    reference_script_id,
    reference_video_url,
    nonce,
    mode,
    locked_fields,
    original_ai_draft,
    current_state,
  } = params;

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

  // Track raw AI response for debugging
  let rawAiResponse = "";
  let aiProvider = "";

  try {
    // Fetch recent hooks for no-repeat logic
    const recentHooks = await getRecentHooksForProduct(product_id.trim());
    console.log(`[${correlationId}] Found ${recentHooks.length} recent hooks to avoid`);

    // Fetch banned hooks from user feedback
    const bannedHooks = await getBannedHooksForBrand(brand, product_id.trim());
    console.log(`[${correlationId}] Found ${bannedHooks.length} banned hooks to avoid`);

    // Fetch proven hooks for inspiration
    const provenHooks = await getProvenHooksForBrand(brand, product_id.trim());
    console.log(`[${correlationId}] Found ${provenHooks.length} proven hooks for inspiration`);

    // Fetch Winners Bank context for style reference
    const winnersBank = await getWinnersBankContext(category, 5);
    console.log(`[${correlationId}] Found ${winnersBank.length} Winners Bank extracts for context`);

    // Fetch rejected hooks (hard exclude)
    const rejectedHooks = await getRejectedHooksForProduct(brand, product_id.trim());
    console.log(`[${correlationId}] Found ${rejectedHooks.length} rejected hooks to exclude`);

    // Fetch underperforming hooks (soft penalize)
    const weakHooks = await getWeakHooksForProduct(brand, product_id.trim());
    console.log(`[${correlationId}] Found ${weakHooks.length} weak hooks to avoid`);

    // Get weak patterns summary for strategic adaptation
    const weakPatternsSummary = await getWeakPatternsSummary(brand, product_id.trim());
    console.log(`[${correlationId}] Weak patterns: ${weakPatternsSummary.map(p => `${p.reason_code}:${p.count}`).join(", ") || "none"}`);

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
      bannedHooks,
      provenHooks,
      winnersBank,
      rejectedHooks,
      weakHooks,
      weakPatternsSummary,
      nonce,
    });

    let aiResult: Partial<DraftVideoBriefResult> | null = null;
    let parseResult: ParseResult | null = null;

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
          temperature: 0.3, // Low temperature for reliable JSON output
          system: "You are a JSON API. Output raw JSON only - no markdown, no code fences, no text before or after. Start with { and end with }.",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[${correlationId}] Anthropic API error: ${response.status} - ${errorText}`);
        throw new Error(`Anthropic API error: ${response.status}`);
      }

      const anthropicResult = await response.json();
      rawAiResponse = anthropicResult.content?.[0]?.text || "";

      if (!rawAiResponse) {
        throw new Error("No content returned from Anthropic");
      }

      console.log(`[${correlationId}] Anthropic response length: ${rawAiResponse.length}`);
      parseResult = safeParseJSON(rawAiResponse);

      if (!parseResult.success || !parseResult.data) {
        console.error(`[${correlationId}] Failed to parse Anthropic response using strategy: ${parseResult.strategy}`);
        // Don't throw yet - we'll handle this below
      } else {
        aiResult = parseResult.data;
      }

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
          messages: [
            { role: "system", content: "You are a JSON API. Output raw JSON only - no markdown, no code fences, no text before or after. Start with { and end with }." },
            { role: "user", content: prompt },
          ],
          max_tokens: 4000,
          temperature: 0.3, // Low temperature for reliable JSON output
          response_format: { type: "json_object" }, // Enforce JSON mode
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[${correlationId}] OpenAI API error: ${response.status} - ${errorText}`);
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const openaiResult = await response.json();
      rawAiResponse = openaiResult.choices?.[0]?.message?.content || "";

      if (!rawAiResponse) {
        throw new Error("No content returned from OpenAI");
      }

      console.log(`[${correlationId}] OpenAI response length: ${rawAiResponse.length}`);
      parseResult = safeParseJSON(rawAiResponse);

      if (!parseResult.success || !parseResult.data) {
        console.error(`[${correlationId}] Failed to parse OpenAI response using strategy: ${parseResult.strategy}`);
        // Don't throw yet - we'll handle this below
      } else {
        aiResult = parseResult.data;
      }
    }

    // Handle parse failure - return structured error with debug info
    if (!aiResult && parseResult) {
      console.error(`[${correlationId}] AI response parsing failed completely`);

      // Build fallback result for UI to still render something
      const fallbackResult = buildFallbackResult(productName, brand);

      const errorResponse: Record<string, unknown> = {
        ok: false,
        error: "Failed to parse AI response. Using fallback content.",
        error_code: "AI_PARSE",
        parse_strategy: parseResult.strategy,
        correlation_id: correlationId,
        // Include fallback data so UI can still function
        data: fallbackResult,
        meta: {
          product_id: product_id.trim(),
          brand,
          product_name: productName,
          ai_provider: aiProvider,
          is_fallback: true,
          parse_error: parseResult.error,
        },
      };

      // Include debug info if debug mode enabled
      if (debugMode) {
        errorResponse.debug = {
          raw_excerpt: rawAiResponse.slice(0, 2000),
          raw_length: rawAiResponse.length,
          parse_attempts: parseResult.strategy,
        };
      }

      // Return 200 with error info so UI can handle gracefully
      return NextResponse.json(errorResponse, { status: 200 });
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

    // NEW: Product display name options (TikTok-safe, max 30 chars)
    const productDisplayNameOptions = Array.isArray(aiResult.product_display_name_options)
      ? aiResult.product_display_name_options.slice(0, 5).map((n: string) => String(n).slice(0, 30))
      : [productName.slice(0, 30)];

    // NEW: CTA script options (persuasive, 1-2 sentences)
    const ctaScriptOptions = Array.isArray(aiResult.cta_script_options)
      ? aiResult.cta_script_options.slice(0, 5)
      : ["This is selling out fast - grab yours before it's gone!", "Everyone's talking about this - link below!", "High demand right now - tap the cart!"];

    // Process hooks_by_emotional_driver
    const hooksByDriver: Record<EmotionalDriver, HookWithMeta[]> = {
      shock: [],
      fear: [],
      curiosity: [],
      insecurity: [],
      fomo: [],
    };

    // Parse hooks_by_emotional_driver from AI response
    const aiHooksByDriver = (aiResult.hooks_by_emotional_driver || {}) as Record<EmotionalDriver, unknown[]>;
    let hasEdgePush = false;

    for (const driver of EMOTIONAL_DRIVERS) {
      const driverHooks = aiHooksByDriver[driver];
      if (Array.isArray(driverHooks)) {
        for (const rawHook of driverHooks) {
          if (rawHook && typeof rawHook === "object") {
            const hookObj = rawHook as { text?: string; hook_family?: string; edge_push?: boolean };
            if (hookObj.text) {
              const hookMeta: HookWithMeta = {
                text: String(hookObj.text),
                emotional_driver: driver,
                hook_family: (HOOK_FAMILIES.includes(hookObj.hook_family as HookFamily) ? hookObj.hook_family : "curiosity_gap") as HookFamily,
                edge_push: Boolean(hookObj.edge_push),
              };
              hooksByDriver[driver].push(hookMeta);
              if (hookMeta.edge_push) hasEdgePush = true;
              // Also add to spokenHooks if not already there
              if (!spokenHooks.includes(hookMeta.text)) {
                spokenHooks.push(hookMeta.text);
              }
            }
          } else if (typeof rawHook === "string") {
            // Legacy format - just text
            hooksByDriver[driver].push({
              text: rawHook,
              emotional_driver: driver,
              hook_family: "curiosity_gap",
              edge_push: false,
            });
            if (!spokenHooks.includes(rawHook)) {
              spokenHooks.push(rawHook);
            }
          }
        }
      }
    }

    // Validate emotional driver distribution
    const driverCounts: Record<EmotionalDriver, number> = {
      shock: hooksByDriver.shock.length,
      fear: hooksByDriver.fear.length,
      curiosity: hooksByDriver.curiosity.length,
      insecurity: hooksByDriver.insecurity.length,
      fomo: hooksByDriver.fomo.length,
    };
    const totalDriverHooks = Object.values(driverCounts).reduce((a, b) => a + b, 0);

    // Log distribution for debugging
    console.log(`[${correlationId}] Emotional driver distribution: shock=${driverCounts.shock}, fear=${driverCounts.fear}, curiosity=${driverCounts.curiosity}, insecurity=${driverCounts.insecurity}, fomo=${driverCounts.fomo}, total=${totalDriverHooks}, edge_push=${hasEdgePush}`);

    // Find best hook by AI-assigned score
    const hookScores = aiResult.hook_scores || {};

    // --- Deterministic hook scoring + sorting ---
    // Build scoring context from proven hooks and winners bank data
    const nowMs = Date.now(); // Capture once for consistent temporal calculations
    const scoringContext: HookScoringContext = {
      provenHooks: provenHooks.map((h) => ({
        text: h.hook_text,
        approved_count: h.approved_count,
        rejected_count: h.rejected_count,
        underperform_count: h.underperform_count,
        winner_count: h.winner_count,
        posted_count: h.posted_count,
        used_count: h.used_count,
        hook_family: h.hook_family,
        created_at: h.created_at,
        updated_at: h.updated_at,
      })),
      winners: winnersBank.map((w) => ({
        hook: w.hook,
      })),
      nowMs,
    };

    // Build a lookup map from normalized hook text to proven hook's family
    const provenFamilyMap = new Map<string, string | null>();
    for (const h of provenHooks) {
      const normalized = h.hook_text.toLowerCase().trim().replace(/\s+/g, " ").replace(/[^\w\s]/g, "");
      provenFamilyMap.set(normalized, h.hook_family);
    }

    // Score and sort spoken hooks (reorders, never removes)
    const scoredSpokenHooks: HookScoreResult[] = scoreAndSortHookOptions(spokenHooks, scoringContext);

    // Score and sort on-screen text hooks
    const scoredTextHooks: HookScoreResult[] = scoreAndSortHookOptions(textHooks, scoringContext);

    // --- Diversity selection: cluster by family, pick top from each family first ---
    // Helper to get family key for an option
    const getFamilyForOption = (option: string): string => {
      const normalized = option.toLowerCase().trim().replace(/\s+/g, " ").replace(/[^\w\s]/g, "");
      const provenFamily = provenFamilyMap.get(normalized);
      return getHookFamilyKey(option, provenFamily);
    };

    // Add family keys to scored hooks
    const spokenWithFamily: ScoredOptionWithFamily[] = scoredSpokenHooks.map((s) => ({
      option: s.option,
      score: s.score,
      familyKey: getFamilyForOption(s.option),
      reasons: s.reasons,
    }));

    const textWithFamily: ScoredOptionWithFamily[] = scoredTextHooks.map((s) => ({
      option: s.option,
      score: s.score,
      familyKey: getFamilyForOption(s.option),
      reasons: s.reasons,
    }));

    // Select with diversity (keep same max as current caps: 12 spoken, 8 text)
    const diverseSpoken = selectDiverseOptions(spokenWithFamily, 12);
    const diverseText = selectDiverseOptions(textWithFamily, 8);

    // Extract ranked options
    const rankedSpokenHooks = diverseSpoken.map((s) => s.option);
    const rankedTextHooks = diverseText.map((s) => s.option);

    // Count unique families for logging
    const spokenFamilies = new Set(diverseSpoken.map((s) => s.familyKey));
    const textFamilies = new Set(diverseText.map((s) => s.familyKey));

    console.log(`[${correlationId}] Hook scoring: top spoken="${rankedSpokenHooks[0]?.slice(0, 50)}" (${diverseSpoken[0]?.score}), families=${spokenFamilies.size}/${diverseSpoken.length}`);

    // Best hook = top-ranked by our scoring (not AI's self-score)
    let bestHook = rankedSpokenHooks[0] || "";
    let bestEmotionalDriver: EmotionalDriver | null = null;

    // Find the emotional driver for the best hook
    for (const driver of EMOTIONAL_DRIVERS) {
      const found = hooksByDriver[driver].find(h => h.text === bestHook);
      if (found) {
        bestEmotionalDriver = driver;
        break;
      }
    }

    const validatedResult: DraftVideoBriefResult = {
      // Product Display Name (TikTok-safe)
      product_display_name_options: productDisplayNameOptions,
      selected_product_display_name: String(aiResult.selected_product_display_name || productDisplayNameOptions[0] || productName.slice(0, 30)),

      // Hook Package (ranked by deterministic scoring)
      spoken_hook_options: rankedSpokenHooks,
      spoken_hook_by_family: aiResult.spoken_hook_by_family || {},
      hooks_by_emotional_driver: hooksByDriver,
      hook_scores: hookScores,
      selected_spoken_hook: bestHook,
      selected_emotional_driver: bestEmotionalDriver,
      has_edge_push: hasEdgePush,

      // Visual hooks
      visual_hook_options: visualHooks.length > 0 ? visualHooks : ["Open on close-up of face, engaging expression, then reveal product"],
      selected_visual_hook: visualHooks[0] || "Open on close-up of face, engaging expression, then reveal product",
      visual_hook: visualHooks[0] || "Open on close-up of face, engaging expression, then reveal product",

      // On-screen text (ranked by deterministic scoring)
      on_screen_text_hook_options: rankedTextHooks.length > 0 ? rankedTextHooks : ["Watch this", "Must see", "Real talk"],
      selected_on_screen_text_hook: rankedTextHooks[0] || "Watch this",
      mid_overlays: midOverlays.length > 0 ? midOverlays : ["Real talk", "No cap", "Trust me"],

      // CTA Script Line (persuasive, for script body)
      cta_script_options: ctaScriptOptions,
      selected_cta_script: String(aiResult.selected_cta_script || ctaScriptOptions[0] || "This is selling out fast - grab yours!"),

      // CTA Overlay (mechanical action only)
      cta_overlay_options: ctaOptions.length > 0 ? ctaOptions : ["Tap the orange cart", "Link in bio", "Shop it here", "Get it now", "Tap to shop"],
      selected_cta_overlay: ctaOptions[0] || "Tap the orange cart",

      // Legacy fields
      on_screen_text_mid: midOverlays.slice(0, 3),
      on_screen_text_cta: ctaOptions[0] || "Tap the orange cart",

      // Standard fields
      angle_options: Array.isArray(aiResult.angle_options) && aiResult.angle_options.length > 0
        ? aiResult.angle_options.slice(0, 5)
        : ["Personal story", "Problem/solution", "Before/after", "Day in my life"],
      selected_angle: String(aiResult.selected_angle || aiResult.angle_options?.[0] || "Personal story"),
      proof_type: ["testimonial", "demo", "comparison", "other"].includes(aiResult.proof_type as string)
        ? (aiResult.proof_type as "testimonial" | "demo" | "comparison" | "other")
        : "testimonial",
      notes: String(aiResult.notes || ""),
      broll_ideas: Array.isArray(aiResult.broll_ideas) && aiResult.broll_ideas.length > 0
        ? aiResult.broll_ideas.slice(0, 5)
        : ["Product close-up", "Unboxing shot", "Using the product", "Before/after comparison"],
      script_draft: String(aiResult.script_draft || `${bestHook}\n\nI've been using ${productName} and had to share my thoughts.\n\nLink in my bio!`),

      // Legacy backwards compat
      hook_options: rankedSpokenHooks,
      selected_hook: bestHook,
      on_screen_text: [
        rankedTextHooks[0] || "Watch this",
        ...(midOverlays.slice(0, 3)),
        ctaOptions[0] || "Tap the orange cart",
      ],
    };

    // Log this generation with debug context
    await logGenerationRun({
      productId: product_id.trim(),
      nonce,
      hookType: hook_type,
      tonePreset: validTonePreset,
      targetLength: target_length,
      output: validatedResult,
      aiProvider,
      correlationId,
      debugContext: {
        winners_used: provenHooks.filter(h => h.winner_count > 0).length,
        rejected_avoided: rejectedHooks.length,
        weak_avoided: weakHooks.length,
        weak_patterns: weakPatternsSummary,
        rejected_hooks_sample: rejectedHooks.slice(0, 5).map(h => h.hook_text),
        weak_hooks_sample: weakHooks.slice(0, 5).map(h => h.hook_text),
      },
    });

    const response: Record<string, unknown> = {
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
        parse_strategy: parseResult?.strategy,
      },
      correlation_id: correlationId,
    };

    // Include debug info if debug mode enabled
    if (debugMode) {
      response.debug = {
        raw_excerpt: rawAiResponse.slice(0, 2000),
        raw_length: rawAiResponse.length,
        parse_strategy: parseResult?.strategy,
        hooks_count: spokenHooks.length,
        driver_distribution: driverCounts,
        // Deterministic hook scoring breakdown (only in debug mode)
        hook_scoring: {
          spoken: scoredSpokenHooks.map((s) => ({ option: s.option, score: s.score, reasons: s.reasons })),
          on_screen_text: scoredTextHooks.map((s) => ({ option: s.option, score: s.score, reasons: s.reasons })),
        },
        // Family diversity debug info
        hook_family_debug: {
          spoken: diverseSpoken.map((s) => ({ option: s.option, family: s.familyKey, score: s.score })),
          on_screen: diverseText.map((s) => ({ option: s.option, family: s.familyKey, score: s.score })),
          spoken_family_count: spokenFamilies.size,
          text_family_count: textFamilies.size,
        },
      };
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error(`[${correlationId}] AI draft generation error:`, error);

    // Build fallback result so UI can still render
    const fallbackResult = buildFallbackResult(productName, brand);

    const errorResponse: Record<string, unknown> = {
      ok: false,
      error: `AI generation failed: ${error instanceof Error ? error.message : String(error)}`,
      error_code: "AI_UNKNOWN",
      correlation_id: correlationId,
      // Include fallback data so UI doesn't completely break
      data: fallbackResult,
      meta: {
        product_id: product_id.trim(),
        brand,
        product_name: productName,
        ai_provider: aiProvider || "none",
        is_fallback: true,
      },
    };

    // Include debug info ONLY when debug mode is explicitly enabled
    if (debugMode) {
      errorResponse.debug = {
        raw_excerpt: rawAiResponse ? rawAiResponse.slice(0, 2000) : null,
        raw_length: rawAiResponse?.length || 0,
        error_message: error instanceof Error ? error.message : String(error),
        error_stack: error instanceof Error ? error.stack?.slice(0, 500) : null,
      };
    }

    // Return 200 with error info so UI can handle gracefully
    return NextResponse.json(errorResponse, { status: 200 });
  }
}
