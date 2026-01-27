import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export interface DraftVideoBriefResult {
  hook_options: string[];
  angle_options: string[];
  selected_hook: string;
  selected_angle: string;
  proof_type: "testimonial" | "demo" | "comparison" | "other";
  notes: string;
  broll_ideas: string[];
  on_screen_text: string[];
  script_draft: string;
}

// Safe JSON parser with repair logic
function safeParseJSON(content: string): { success: boolean; data: DraftVideoBriefResult | null; strategy: string } {
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

// Deterministic template-based fallback when AI is unavailable
function generateTemplateBrief(brand: string, productName: string, category: string): DraftVideoBriefResult {
  const categoryHooks: Record<string, string[]> = {
    supplements: [
      `This ${brand} product changed my morning routine`,
      `Why everyone's talking about ${productName}`,
      `I tried ${productName} for 30 days - here's what happened`,
      `The ${brand} secret I wish I knew sooner`,
    ],
    beauty: [
      `My skin after using ${productName}`,
      `${brand}'s viral product is actually worth it`,
      `The glow-up hack everyone's asking about`,
      `Why I switched to ${productName}`,
    ],
    fitness: [
      `Game changer for my workouts: ${productName}`,
      `${brand} just made fitness easier`,
      `The one product that leveled up my routine`,
      `Why athletes are choosing ${brand}`,
    ],
    default: [
      `Why ${productName} is going viral`,
      `I finally tried ${brand}'s most popular product`,
      `The ${productName} review you need to see`,
      `${brand} delivers - here's proof`,
    ],
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

  const hooks = categoryHooks[category] || categoryHooks.default;
  const angles = categoryAngles[category] || categoryAngles.default;

  const proofTypes: Array<"testimonial" | "demo" | "comparison"> = ["testimonial", "demo", "comparison"];
  const proofType = proofTypes[Math.floor(Math.random() * proofTypes.length)];

  return {
    hook_options: hooks,
    angle_options: angles,
    selected_hook: hooks[0],
    selected_angle: angles[0],
    proof_type: proofType,
    notes: `Feature ${productName}'s key benefits. Show authentic usage. Include clear CTA for TikTok Shop.`,
    broll_ideas: [
      `Close-up of ${productName} packaging`,
      "Lifestyle shot using the product",
      "Before/after or reaction moment",
      "Unboxing or first impression",
    ],
    on_screen_text: [
      hooks[0],
      `${brand} ${productName}`,
      "Link in bio!",
    ],
    script_draft: `${hooks[0]}

So I've been using ${productName} from ${brand} and I have to share my experience.

${proofType === "testimonial" ? "Here's what I noticed after using it..." : proofType === "demo" ? "Let me show you how I use it..." : "Compared to what I was using before..."}

The quality is amazing and it's become part of my daily routine.

If you want to try it, check the link - ${brand} is available on TikTok Shop right now!`,
  };
}

/**
 * POST /api/ai/draft-video-brief
 *
 * Generates a complete video brief using AI from just Brand + Product.
 * Returns hook options, angle options, proof type, notes, and a script draft.
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

  const { product_id } = body as { product_id?: string };

  // Validate product_id
  if (!product_id || typeof product_id !== "string" || product_id.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "product_id is required", error_code: "VALIDATION_ERROR", correlation_id: correlationId },
      { status: 400 }
    );
  }

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
    const templateResult = generateTemplateBrief(brand, productName, category);
    return NextResponse.json({
      ok: true,
      data: templateResult,
      meta: {
        product_id: product_id.trim(),
        brand,
        product_name: productName,
        ai_provider: "template_fallback",
      },
      correlation_id: correlationId,
    });
  }

  try {
    const prompt = `Generate a complete TikTok Shop video brief for this product:

Brand: ${brand}
Product: ${productName}
Category: ${category}
${productUrl ? `Product URL: ${productUrl}` : ""}
${productNotes ? `Notes: ${productNotes}` : ""}

Generate a JSON object with:
1. hook_options: Array of 4 engaging TikTok hooks (5-12 words each, curiosity-driven)
2. angle_options: Array of 4 marketing angles (short phrases)
3. selected_hook: The best hook from the options
4. selected_angle: The best angle from the options
5. proof_type: One of "testimonial", "demo", or "comparison"
6. notes: Brief production notes (1-2 sentences)
7. broll_ideas: Array of 4 B-roll shot ideas
8. on_screen_text: Array of 3 text overlays for the video
9. script_draft: A complete 30-60 second TikTok script

Requirements:
- Hooks must be viral-worthy and scroll-stopping
- For supplements: NO medical claims, avoid "cure", "treat", "diagnose", "guaranteed"
- Focus on lifestyle benefits and authentic experience
- Script should feel natural and conversational
- Include clear call-to-action for TikTok Shop

Return ONLY valid JSON. No markdown. No code fences.

{
  "hook_options": ["Hook 1", "Hook 2", "Hook 3", "Hook 4"],
  "angle_options": ["Angle 1", "Angle 2", "Angle 3", "Angle 4"],
  "selected_hook": "Best hook here",
  "selected_angle": "Best angle here",
  "proof_type": "testimonial",
  "notes": "Production notes here",
  "broll_ideas": ["Shot 1", "Shot 2", "Shot 3", "Shot 4"],
  "on_screen_text": ["Text 1", "Text 2", "Text 3"],
  "script_draft": "Full script text here..."
}`;

    let aiResult: DraftVideoBriefResult | null = null;
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
          max_tokens: 2000,
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
          max_tokens: 2000,
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

    // Validate and sanitize the result
    const validatedResult: DraftVideoBriefResult = {
      hook_options: Array.isArray(aiResult.hook_options) ? aiResult.hook_options.slice(0, 5) : [],
      angle_options: Array.isArray(aiResult.angle_options) ? aiResult.angle_options.slice(0, 5) : [],
      selected_hook: String(aiResult.selected_hook || aiResult.hook_options?.[0] || ""),
      selected_angle: String(aiResult.selected_angle || aiResult.angle_options?.[0] || ""),
      proof_type: ["testimonial", "demo", "comparison", "other"].includes(aiResult.proof_type)
        ? aiResult.proof_type
        : "testimonial",
      notes: String(aiResult.notes || ""),
      broll_ideas: Array.isArray(aiResult.broll_ideas) ? aiResult.broll_ideas.slice(0, 5) : [],
      on_screen_text: Array.isArray(aiResult.on_screen_text) ? aiResult.on_screen_text.slice(0, 5) : [],
      script_draft: String(aiResult.script_draft || ""),
    };

    return NextResponse.json({
      ok: true,
      data: validatedResult,
      meta: {
        product_id: product_id.trim(),
        brand,
        product_name: productName,
        ai_provider: aiProvider,
      },
      correlation_id: correlationId,
    });

  } catch (error) {
    console.error(`[${correlationId}] AI draft generation error:`, error);

    // Fallback to template on AI failure
    console.log(`[${correlationId}] Falling back to template generation`);
    const templateResult = generateTemplateBrief(brand, productName, category);

    return NextResponse.json({
      ok: true,
      data: templateResult,
      meta: {
        product_id: product_id.trim(),
        brand,
        product_name: productName,
        ai_provider: "template_fallback",
        ai_error: String(error),
      },
      correlation_id: correlationId,
    });
  }
}
