import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;
/**
 * Input schema for product enrichment
 */
const EnrichProductSchema = z.object({
  name: z.string().min(1),
  brand: z.string().min(1),
  category: z.string().min(1),
  description: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  sold_count: z.number().nullable().optional(),
  seller_location: z.string().nullable().optional(),
  variants: z.array(z.string()).optional().default([]),
  raw_text: z.string().optional(), // Any extra context user wants to provide
});

/**
 * AI-generated product enrichment data
 */
export interface ProductEnrichment {
  // Selling points
  benefits: string[]; // 4-6 key benefits
  unique_selling_points: string[]; // 3-5 USPs that differentiate it

  // Target audiences
  target_audiences: {
    segment: string; // e.g., "Busy Moms 30-45"
    demographics: string; // Age, gender, income, location
    psychographics: string; // Values, lifestyle, pain points
    why_this_product: string; // Why this segment needs this product
  }[];

  // Hook angles for content
  hook_angles: {
    angle: string; // The core hook concept
    example_opening: string; // Example first 3 seconds
    best_for_audience: string; // Which target audience segment
  }[];

  // Objection handlers
  objections: {
    objection: string; // Common objection
    handler: string; // How to address it in content
  }[];

  // Competitive positioning
  differentiators: string[]; // What makes this better than alternatives

  // Content recommendations
  cta_suggestions: string[]; // Call-to-action ideas
  content_angles: string[]; // Different ways to talk about the product

  // Meta insights
  recommended_price_positioning: string; // How to position the price
  urgency_triggers: string[]; // Scarcity/urgency angles
}

/**
 * Build enrichment prompt for Claude
 */
function buildEnrichmentPrompt(input: z.infer<typeof EnrichProductSchema>): string {
  const {
    name,
    brand,
    category,
    description,
    price,
    sold_count,
    seller_location,
    variants,
    raw_text,
  } = input;

  // Build context block
  const contextLines: string[] = [
    `PRODUCT: ${name}`,
    `BRAND: ${brand}`,
    `CATEGORY: ${category}`,
  ];

  if (price) contextLines.push(`PRICE: $${price.toFixed(2)}`);
  if (sold_count) contextLines.push(`UNITS SOLD: ${sold_count.toLocaleString()}`);
  if (seller_location) contextLines.push(`LOCATION: ${seller_location}`);
  if (variants.length > 0) contextLines.push(`VARIANTS: ${variants.join(', ')}`);

  const contextBlock = contextLines.join('\n');

  const descriptionBlock = [
    description || null,
    raw_text || null,
  ].filter(Boolean).join('\n\n') || 'No description provided — infer from product name and category.';

  return `You are a TikTok UGC strategist and product marketing expert. Your job is to analyze a product and extract all the selling intelligence needed to create viral TikTok content.

${contextBlock}

FULL PRODUCT DESCRIPTION:
${descriptionBlock}

Generate a comprehensive analysis that includes:

1. **BENEFITS** (4-6 key benefits)
   - What problems does this solve?
   - What improvements does the customer experience?
   - Be specific and customer-focused

2. **UNIQUE SELLING POINTS** (3-5 USPs)
   - What makes THIS product different from competitors?
   - What's the unfair advantage or secret sauce?
   - Why would someone choose this over alternatives?

3. **TARGET AUDIENCES** (3-4 segments)
   For each segment, identify:
   - Segment name (e.g., "Health-Conscious Men 35-50")
   - Demographics (age, gender, income, location type)
   - Psychographics (values, lifestyle, interests, behaviors)
   - Why this product is perfect for them

4. **HOOK ANGLES** (5-7 viral content angles)
   For each hook:
   - The core concept/angle
   - An example opening line (first 3 seconds of TikTok)
   - Which target audience it works best for

5. **OBJECTION HANDLERS** (4-6 common objections)
   For each objection:
   - The objection customers have
   - How to address it authentically in content

6. **DIFFERENTIATORS** (3-5 competitive advantages)
   - What makes this better than similar products?
   - Concrete reasons why customers should choose this

7. **CTA SUGGESTIONS** (3-5 call-to-action ideas)
   - Different ways to drive action
   - Match CTA to different content angles

8. **CONTENT ANGLES** (5-7 different approaches)
   - Different ways to talk about/present the product
   - Variety of approaches for different content pieces

9. **PRICE POSITIONING** (single recommendation)
   - How to position the price point
   - Whether to emphasize value, investment, comparison, etc.

10. **URGENCY TRIGGERS** (3-5 scarcity/urgency angles)
    - Limited time/quantity angles
    - Social proof angles
    - FOMO triggers

CRITICAL INSTRUCTIONS:
- Be SPECIFIC to this exact product — not generic marketing advice
- Write in the language of the TARGET CUSTOMER, not corporate speak
- Focus on TikTok UGC content — authentic, relatable, scroll-stopping
- If price is high, lean into value/investment positioning
- If sold_count is high, leverage social proof heavily
- Make every insight actionable for content creation

Output valid JSON with this exact structure:

{
  "benefits": ["benefit 1", "benefit 2", ...],
  "unique_selling_points": ["USP 1", "USP 2", ...],
  "target_audiences": [
    {
      "segment": "segment name",
      "demographics": "age, gender, income, location",
      "psychographics": "values, lifestyle, interests",
      "why_this_product": "why this segment needs it"
    }
  ],
  "hook_angles": [
    {
      "angle": "core concept",
      "example_opening": "example first 3 seconds",
      "best_for_audience": "target segment"
    }
  ],
  "objections": [
    {
      "objection": "common concern",
      "handler": "how to address it"
    }
  ],
  "differentiators": ["differentiator 1", "differentiator 2", ...],
  "cta_suggestions": ["CTA 1", "CTA 2", ...],
  "content_angles": ["angle 1", "angle 2", ...],
  "recommended_price_positioning": "how to position price",
  "urgency_triggers": ["trigger 1", "trigger 2", ...]
}

Generate the enrichment now:`;
}

/**
 * Parse AI response into ProductEnrichment
 */
function parseEnrichmentResponse(response: string): ProductEnrichment {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                    response.match(/```\s*([\s\S]*?)\s*```/);

  let jsonStr = jsonMatch ? jsonMatch[1].trim() : response;

  // Try to find JSON object directly if not in code block
  if (!jsonMatch) {
    const objectMatch = response.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // Validate and normalize structure
    return {
      benefits: Array.isArray(parsed.benefits) ? parsed.benefits : [],
      unique_selling_points: Array.isArray(parsed.unique_selling_points) ? parsed.unique_selling_points : [],
      target_audiences: Array.isArray(parsed.target_audiences) ? parsed.target_audiences : [],
      hook_angles: Array.isArray(parsed.hook_angles) ? parsed.hook_angles : [],
      objections: Array.isArray(parsed.objections) ? parsed.objections : [],
      differentiators: Array.isArray(parsed.differentiators) ? parsed.differentiators : [],
      cta_suggestions: Array.isArray(parsed.cta_suggestions) ? parsed.cta_suggestions : [],
      content_angles: Array.isArray(parsed.content_angles) ? parsed.content_angles : [],
      recommended_price_positioning: String(parsed.recommended_price_positioning || ''),
      urgency_triggers: Array.isArray(parsed.urgency_triggers) ? parsed.urgency_triggers : [],
    };
  } catch (err) {
    console.error('[product-enrich] Failed to parse AI response:', err);
    throw new Error('Failed to parse enrichment data from AI response');
  }
}

/**
 * Call Claude API to generate enrichment
 */
async function generateEnrichment(input: z.infer<typeof EnrichProductSchema>): Promise<ProductEnrichment> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const prompt = buildEnrichmentPrompt(input);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[product-enrich] AI API error:', errorText);
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '';

  return parseEnrichmentResponse(content);
}

/**
 * POST /api/products/enrich
 *
 * Generate AI-powered product enrichment data
 *
 * Body: {
 *   name: string,
 *   brand: string,
 *   category: string,
 *   description?: string,
 *   price?: number,
 *   sold_count?: number,
 *   seller_location?: string,
 *   variants?: string[],
 *   raw_text?: string
 * }
 *
 * Returns: ProductEnrichment with selling intelligence
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  try {
    // Auth check - supports SESSION, API KEY (ff_ak_*), or SERVICE_API_KEY
    const auth = await validateApiAccess(request);
    if (!auth) {
      return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
    }

    // Parse and validate input
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
    }

    const parseResult = EnrichProductSchema.safeParse(body);
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map(e => `${e.path.join(".")}: ${e.message}`);
      return createApiErrorResponse(
        "VALIDATION_ERROR",
        "Validation failed",
        400,
        correlationId,
        { errors }
      );
    }

    const input = parseResult.data;

    // Generate enrichment via AI
    const enrichment = await generateEnrichment(input);

    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data: {
        enrichment,
        input_summary: {
          product: input.name,
          brand: input.brand,
          category: input.category,
        },
      },
    });

    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    // Check if it's an AI API error
    if (errorMessage.includes('AI API error') || errorMessage.includes('not configured')) {
      return createApiErrorResponse(
        "AI_ERROR",
        errorMessage,
        500,
        correlationId
      );
    }

    return createApiErrorResponse(
      "INTERNAL",
      `Unexpected error: ${errorMessage}`,
      500,
      correlationId
    );
  }
}
