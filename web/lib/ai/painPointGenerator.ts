/**
 * Pain Point Generator Module
 * Generates audience pain points for products via AI
 */

export interface PainPoint {
  point: string;
  category: 'emotional' | 'practical' | 'social' | 'financial';
  intensity: 'mild' | 'moderate' | 'severe';
  hook_angle: string;
}

export interface PainPointGenerationResult {
  pain_points: PainPoint[];
  product_category_insights: string;
  target_audience_summary: string;
}

/**
 * Build the prompt for generating pain points
 */
export function buildPainPointPrompt(
  productName: string,
  brandName: string,
  category: string,
  description?: string | null,
  notes?: string | null
): string {
  // Combine all product context into one block — notes often has the real detail
  const fullDescription = [description, notes].filter(Boolean).join('\n\n');

  return `You are a TikTok content strategist who deeply understands customer psychology.

PRODUCT: ${productName}
BRAND: ${brandName}
CATEGORY: ${category}

FULL PRODUCT DESCRIPTION:
${fullDescription || 'No description provided — infer from product name and category.'}

Based on the SPECIFIC product details above, generate 6-8 highly specific pain points.

CRITICAL: Your pain points MUST directly relate to what THIS SPECIFIC product solves. Read every detail in the product description — ingredients, benefits, use cases — and generate pain points that match the EXACT problems this product addresses.

RULES:
1. Pain points must DIRECTLY relate to what this product solves
2. Use emotional language that resonates on TikTok
3. Be specific enough that customers think "that's exactly me!"
4. Each pain point could be the opening hook of a viral TikTok
5. Write as a REAL PERSON would describe their problem, not marketing copy
6. Mix of emotional, practical, social, and financial categories
7. At least 2 should be "severe" intensity

DO NOT generate generic pain points like:
- "Overwhelmed by too many choices"
- "Worried about product quality"
- "Frustrated with the shopping experience"
- "Decision paralysis"
- "Feeling like nothing works"

DO generate specific pain points based on the product's actual benefits. Examples:
- For a prostate supplement: "Waking up 3-4 times a night and your wife is tired of hearing about it"
- For a testosterone booster: "Feeling like you lost your edge somewhere in your 30s"
- For a sleep aid: "Lying awake at 2am watching the ceiling while your mind races"
- For a skincare product: "That moment when you see your face in a car mirror and barely recognize yourself"

Output valid JSON with this exact structure:
{
  "pain_points": [
    {
      "point": "Specific pain point in customer's voice (10-15 words)",
      "category": "emotional|practical|social|financial",
      "intensity": "mild|moderate|severe",
      "hook_angle": "A TikTok opening line that calls out this pain point (scroll-stopping)"
    }
  ],
  "product_category_insights": "Brief insight about this product category",
  "target_audience_summary": "Who experiences these pain points most acutely"
}

Generate the pain points now:`;
}

/**
 * Parse AI response for pain points
 */
export function parsePainPointResponse(response: string): PainPointGenerationResult {
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

    // Validate structure
    if (!parsed.pain_points || !Array.isArray(parsed.pain_points)) {
      throw new Error('Invalid pain_points structure');
    }

    // Validate and normalize each pain point
    const validatedPainPoints: PainPoint[] = parsed.pain_points.map((pp: Record<string, unknown>) => ({
      point: String(pp.point || ''),
      category: validateCategory(pp.category),
      intensity: validateIntensity(pp.intensity),
      hook_angle: String(pp.hook_angle || ''),
    })).filter((pp: PainPoint) => pp.point.length > 0);

    return {
      pain_points: validatedPainPoints,
      product_category_insights: String(parsed.product_category_insights || ''),
      target_audience_summary: String(parsed.target_audience_summary || ''),
    };
  } catch (err) {
    console.error('[painPointGenerator] Failed to parse response:', err);
    throw new Error('Failed to parse pain points from AI response');
  }
}

function validateCategory(category: unknown): PainPoint['category'] {
  const valid = ['emotional', 'practical', 'social', 'financial'];
  if (typeof category === 'string' && valid.includes(category)) {
    return category as PainPoint['category'];
  }
  return 'practical';
}

function validateIntensity(intensity: unknown): PainPoint['intensity'] {
  const valid = ['mild', 'moderate', 'severe'];
  if (typeof intensity === 'string' && valid.includes(intensity)) {
    return intensity as PainPoint['intensity'];
  }
  return 'moderate';
}

/**
 * Call AI to generate pain points
 */
export async function generatePainPoints(
  productName: string,
  brandName: string,
  category: string,
  description?: string | null,
  notes?: string | null
): Promise<PainPointGenerationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const prompt = buildPainPointPrompt(productName, brandName, category, description, notes);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
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
    console.error('[painPointGenerator] API error:', errorText);
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '';

  return parsePainPointResponse(content);
}
