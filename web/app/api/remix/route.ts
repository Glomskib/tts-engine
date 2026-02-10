import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

interface RemixRequest {
  source_type: 'winner' | 'script' | 'competitor';
  source_id?: string;
  source_text: string;
  remix_style: 'variation' | 'angle_shift' | 'audience_swap' | 'tone_change' | 'shorten' | 'expand';
  target_product_id?: string;
  custom_instructions?: string;
}

const REMIX_PROMPTS: Record<string, string> = {
  variation: 'Create a fresh variation of this script. Keep the core message but change the hook, examples, and delivery style.',
  angle_shift: 'Rewrite this script from a completely different angle. Same product benefits, but new perspective (e.g., problem-solution, testimonial, day-in-life, comparison).',
  audience_swap: 'Adapt this script for a different audience demographic. Make it resonate with a new target group while keeping the product pitch intact.',
  tone_change: 'Rewrite this script with a different tone — if it\'s serious make it funny, if casual make it professional, if energetic make it calm and authoritative.',
  shorten: 'Condense this script to under 30 seconds (about 75 words). Keep the hook and CTA but trim the middle.',
  expand: 'Expand this script to 60-90 seconds. Add more detail, social proof, objection handling, or storytelling in the middle section.',
};

/**
 * POST /api/remix
 * Generate a remixed version of a script/winner/competitor content
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let body: RemixRequest;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  if (!body.source_text || !body.remix_style) {
    return createApiErrorResponse('BAD_REQUEST', 'source_text and remix_style are required', 400, correlationId);
  }

  const stylePrompt = REMIX_PROMPTS[body.remix_style];
  if (!stylePrompt) {
    return createApiErrorResponse('BAD_REQUEST', `Invalid remix_style: ${body.remix_style}`, 400, correlationId);
  }

  // Get product context if specified
  let productContext = '';
  if (body.target_product_id) {
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('name, brand, description')
      .eq('id', body.target_product_id)
      .single();
    if (product) {
      productContext = `\n\nTarget Product: ${product.name} by ${product.brand}. ${product.description || ''}`;
    }
  }

  const systemPrompt = `You are a TikTok content remix engine. You take existing successful scripts and create variations.
Output a JSON object with these fields:
- hook: string (opening hook, max 100 chars)
- body: string (main content)
- cta: string (call to action)
- on_screen_text: string[] (2-4 text overlay suggestions)
- pacing: "slow" | "medium" | "fast"
- remix_notes: string (brief note on what you changed and why)

Only output valid JSON, no markdown or explanation.`;

  const userPrompt = `${stylePrompt}${body.custom_instructions ? `\n\nAdditional instructions: ${body.custom_instructions}` : ''}${productContext}

Original script:
${body.source_text}`;

  try {
    // Use OpenAI-compatible endpoint (Anthropic messages API)
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return createApiErrorResponse('AI_ERROR', 'AI service not configured', 500, correlationId);
    }

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('Anthropic API error:', errText);
      return createApiErrorResponse('AI_ERROR', 'AI generation failed', 500, correlationId);
    }

    const aiData = await aiRes.json();
    const rawText = aiData.content?.[0]?.text || '';

    // Parse JSON from response (handle markdown code blocks)
    let remixed;
    try {
      const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      remixed = JSON.parse(jsonStr);
    } catch {
      return createApiErrorResponse('AI_ERROR', 'Failed to parse AI response', 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: {
        remix_style: body.remix_style,
        source_type: body.source_type,
        remixed_script: remixed,
        raw_text: `HOOK: ${remixed.hook}\n\n${remixed.body}\n\nCTA: ${remixed.cta}`,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error('Remix error:', err);
    return createApiErrorResponse('AI_ERROR', 'Remix generation failed', 500, correlationId);
  }
}
