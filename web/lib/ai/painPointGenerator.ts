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
  let context = `Product: ${productName}
Brand: ${brandName}
Category: ${category}`;

  if (description) {
    context += `\nDescription: ${description}`;
  }
  if (notes) {
    context += `\nNotes: ${notes}`;
  }

  return `You are an expert marketing psychologist specializing in consumer pain points and emotional triggers. Analyze this product and generate the key pain points that would make someone buy it.

${context}

Generate 5-8 specific pain points that would resonate with the target audience for this product. Each pain point should:
1. Be specific and actionable (not generic like "wants to save money")
2. Tap into real emotional, practical, social, or financial frustrations
3. Include a hook angle that could be used in marketing content

Output valid JSON with this exact structure:
{
  "pain_points": [
    {
      "point": "Specific pain point description - what the customer is struggling with",
      "category": "emotional|practical|social|financial",
      "intensity": "mild|moderate|severe",
      "hook_angle": "A hook line that calls out this pain point directly"
    }
  ],
  "product_category_insights": "Brief insight about this product category and common pain points",
  "target_audience_summary": "Brief description of who experiences these pain points most acutely"
}

REQUIREMENTS:
- Pain points must be SPECIFIC to this type of product, not generic
- Include a mix of categories (emotional, practical, social, financial)
- Hook angles should be scroll-stopping and relatable
- Intensity should reflect how urgently customers feel this pain
- Write from the customer's perspective, using language they would use

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
