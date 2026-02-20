import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { enforceRateLimits, extractRateLimitContext } from "@/lib/rate-limit";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

interface VoiceBriefRequest {
  transcript: string;
  available_products: Array<{ id: string; name: string; brand: string }>;
  available_personas: Array<{ id: string; name: string }>;
  available_creator_personas: Array<{ id: string; name: string }>;
}

interface InterpretedParams {
  product_id: string;
  product_name: string;
  platform: string;
  content_type_id: string;
  content_subtype_id: string;
  presentation_style_id: string;
  target_length_id: string;
  humor_level_id: string;
  risk_tier: string;
  creator_persona_id: string;
  audience_persona_id: string;
  pain_points: string[];
  creative_direction: string;
  variation_count: number;
  confidence: "high" | "medium" | "low";
  interpretation_notes: string;
}

const SYSTEM_PROMPT = `You are a senior creative director at a viral short-form video agency. A creator just described a product to you in a casual, brainstorming conversation. Your job is to LISTEN to what they're excited about, understand the product deeply, and then make STRATEGIC creative decisions about what kind of video would perform best.

You are NOT a literal transcription mapper. You are a creative partner who:
1. Identifies the product and brand from context clues (partial names, descriptions, brand mentions)
2. Understands what makes this product interesting or unique based on what the creator noticed
3. Picks up on the creator's natural energy and enthusiasm — if they're funny about it, lean into comedy; if they're genuinely impressed, lean into authenticity
4. Makes smart creative decisions based on what would actually go VIRAL with this product

## Your Creative Decision Process

**Step 1: Product Recognition**
Match what they said against the available products list. They might say the brand name, a partial product name, describe what it does, or mention ingredients/features. Be flexible — "that Fourth Leaf creatine" or "the micronized powder" or "this creatine from Fourth Leaf" should all match.

**Step 2: Read the Energy**
- Are they excited/amazed? → testimonial, reaction, or UGC style
- Are they joking around? → skit or comedy content
- Are they explaining/educating? → educational or how-to
- Are they comparing to alternatives? → comparison or product demo
- Are they telling a personal story? → story/narrative or day-in-the-life
- Are they focused on a specific feature? → product demo or educational

**Step 3: Strategic Creative Choices**
Don't just map words — think about what would make the BEST video:
- A creator gushing about how well something mixes → "day in the life" or "reaction" beats a dry "product demo"
- Someone joking about a product → comedy skit beats a testimonial
- Someone mentioning a specific pain point they had → build the hook around THAT pain point
- If they mention something surprising about the product → that's your hook angle

**Step 4: Extract Creative Gold**
Pull out the specific details, phrases, and observations they made — these become the "creative_direction" that shapes the actual script. Their natural language about the product is more authentic than anything an AI would generate from scratch.

## Output Parameters

You MUST respond with valid JSON only. No markdown, no explanation.

Content types: "tof", "mof", "ugc_short", "bof", "testimonial", "skit", "slideshow_story", "educational", "story"

Subtypes by content type:
- tof: hook_teaser, viral_moment, trend, educational_snippet, relatable
- mof: product_demo, how_it_works, comparison, day_in_life, behind_scenes
- ugc_short: reaction, silent_demo, comment_bait, before_after
- bof: flash_sale, limited_offer, price_drop, last_chance, restock_alert
- testimonial: customer_story, before_after, unboxing, review, results
- skit: two_person, character_sketch, parody, relatable_situation, product_integration
- slideshow_story: transformation, day_in_life, problem_journey, emotional_reveal, montage
- educational: quick_tip, tutorial, myth_busting, expert_advice, listicle
- story: origin_story, transformation, day_in_life_story, struggle_success, founder_story

Presentation styles: "talking_head", "human_actor", "ai_avatar", "voiceover", "text_overlay", "ugc_style", "mixed"
Lengths: "micro" (5-15s), "short" (15-30s), "medium" (30-60s), "long" (60-90s)
Humor: "none", "light", "moderate", "heavy"
Risk: "SAFE", "BALANCED", "SPICY"
Platforms: "tiktok", "youtube_shorts", "youtube_long", "instagram"

## Response Format
{
  "product_id": "matched product id or empty string",
  "product_name": "product name if no id match",
  "platform": "tiktok",
  "content_type_id": "chosen strategically",
  "content_subtype_id": "best fit within type",
  "presentation_style_id": "based on energy",
  "target_length_id": "based on how much they said",
  "humor_level_id": "based on their tone",
  "risk_tier": "BALANCED",
  "creator_persona_id": "if they match one",
  "audience_persona_id": "best fit for product",
  "pain_points": ["extracted from what they said"],
  "creative_direction": "The gold — their specific observations, phrases, and angles woven into creative direction for the scriptwriter. Include their exact words and enthusiasm. This is the brief the scriptwriter will use.",
  "variation_count": 3,
  "confidence": "high|medium|low",
  "interpretation_notes": "1-2 sentences: what you understood and the creative angle you chose"
}`;

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Rate limiting check
  const authContext = await getApiAuthContext(request);
  const rateLimitContext = {
    userId: authContext.user?.id ?? null,
    orgId: null,
    ...extractRateLimitContext(request),
  };
  const rateLimitResponse = enforceRateLimits(rateLimitContext, correlationId);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  const { transcript, available_products, available_personas, available_creator_personas } = body as VoiceBriefRequest;

  if (!transcript || typeof transcript !== "string" || transcript.trim() === "") {
    return createApiErrorResponse("BAD_REQUEST", "Transcript is required", 400, correlationId);
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    return createApiErrorResponse("AI_ERROR", "AI service unavailable", 503, correlationId);
  }

  // --- Step 1: Fuzzy match the product from transcript ---
  // Look for brand/product name mentions to enrich context
  let productContext = "";
  let matchedProductId = "";
  const transcriptLower = transcript.toLowerCase();

  for (const p of (available_products || [])) {
    const nameLower = p.name.toLowerCase();
    const brandLower = p.brand.toLowerCase();
    // Check if brand or product name appears in transcript
    if (transcriptLower.includes(brandLower) || transcriptLower.includes(nameLower) ||
        // Also check individual words from product name (e.g., "creatine" from "Micronized Creatine")
        nameLower.split(/\s+/).some(word => word.length > 3 && transcriptLower.includes(word))) {
      matchedProductId = p.id;
      break;
    }
  }

  // If we matched a product, fetch its full details from DB for richer context
  if (matchedProductId) {
    try {
      const { data: product } = await supabaseAdmin
        .from("products")
        .select("name, brand, category, description, notes, primary_gender, primary_age_range, primary_location")
        .eq("id", matchedProductId)
        .single();

      if (product) {
        productContext = `\n\nPRODUCT INTEL (from our database — use this to inform creative decisions):
- Full name: ${product.name}
- Brand: ${product.brand}
- Category: ${product.category || "General"}
- Description: ${product.description || "N/A"}
- Notes: ${product.notes || "N/A"}
- Primary audience: ${[product.primary_gender, product.primary_age_range, product.primary_location].filter(Boolean).join(", ") || "Not specified"}
- Database ID: ${matchedProductId}`;
      }
    } catch {
      // Non-blocking — continue without enrichment
    }
  }

  // Build user message with context
  const userMessage = `Here's what the creator said (casual brainstorm, not a formal brief):

"${transcript.trim()}"
${productContext}

Available products in their catalog:
${(available_products || []).map(p => `- id: "${p.id}", name: "${p.name}", brand: "${p.brand}"`).join("\n") || "None"}

Available audience personas:
${(available_personas || []).map(p => `- id: "${p.id}", name: "${p.name}"`).join("\n") || "None"}

Available creator personas:
${(available_creator_personas || []).map(p => `- id: "${p.id}", name: "${p.name}"`).join("\n") || "None"}

Listen to their energy, identify the product, and make your creative call. Return JSON.`;

  try {
    let responseText = "";

    if (anthropicKey) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1500,
          temperature: 0.4,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Anthropic API error: ${res.status} - ${errorText}`);
      }

      const result = await res.json();
      responseText = result.content?.[0]?.text || "";

    } else if (openaiKey) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          max_tokens: 1500,
          temperature: 0.4,
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`OpenAI API error: ${res.status} - ${errorText}`);
      }

      const result = await res.json();
      responseText = result.choices?.[0]?.message?.content || "";
    }

    // Parse JSON from response
    let params: InterpretedParams;
    try {
      // Strip markdown code fences if present
      const cleaned = responseText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      params = JSON.parse(cleaned);
    } catch {
      console.error(`[${correlationId}] Failed to parse AI response:`, responseText);
      return createApiErrorResponse(
        "AI_ERROR",
        "Failed to interpret voice brief — AI returned invalid format",
        500,
        correlationId
      );
    }

    // If we pre-matched a product but AI didn't set it, inject it
    if (matchedProductId && !params.product_id) {
      params.product_id = matchedProductId;
    }

    const successResponse = NextResponse.json({
      ok: true,
      params,
      correlation_id: correlationId,
    });
    successResponse.headers.set("x-correlation-id", correlationId);
    return successResponse;

  } catch (error) {
    console.error(`[${correlationId}] Voice brief interpretation error:`, error);
    return createApiErrorResponse(
      "AI_ERROR",
      `AI error: ${error instanceof Error ? error.message : String(error)}`,
      500,
      correlationId
    );
  }
}
