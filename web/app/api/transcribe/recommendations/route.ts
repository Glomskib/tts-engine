import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { checkRateLimit, recordUsage } from '@/lib/transcribe-rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/transcribe/recommendations
 *
 * Generates AI-powered recommendations based on a transcript analysis:
 * - 3 script concepts
 * - 5 alternative hooks (different styles)
 * - 3 product category suggestions
 *
 * Counts as 1 use from the shared transcriber rate limit pool.
 */
export async function POST(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';

  const auth = await getApiAuthContext(request);
  const userId = auth.user?.id ?? null;

  const { allowed, remaining, limit } = await checkRateLimit(ip, userId);

  if (!allowed) {
    const msg = userId
      ? "You've reached your daily AI limit. Check back tomorrow!"
      : "You've reached your daily limit. Sign up for FlashFlow to get more AI uses!";
    return NextResponse.json(
      { error: msg, signupUrl: userId ? undefined : '/signup' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Limit': String(limit),
        },
      }
    );
  }

  let body: { transcript?: string; analysis?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { transcript, analysis } = body;
  if (!transcript || typeof transcript !== 'string' || transcript.length < 10) {
    return NextResponse.json({ error: 'Transcript is required.' }, { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'AI service not configured.' }, { status: 500 });
  }

  const requestStart = Date.now();

  try {
    const hookLine = (analysis as Record<string, Record<string, string>>)?.hook?.line || '';
    const hookStyle = (analysis as Record<string, Record<string, string>>)?.hook?.style || '';
    const keyPhrases = (analysis as Record<string, string[]>)?.keyPhrases || [];
    const whatWorks = (analysis as Record<string, string[]>)?.whatWorks || [];

    const prompt = `Based on this TikTok video transcript and analysis, generate creative recommendations. Return ONLY valid JSON.

TRANSCRIPT:
${transcript.slice(0, 2000)}

ANALYSIS:
- Hook: "${hookLine}" (style: ${hookStyle})
- Key Phrases: ${keyPhrases.join(', ')}
- What Works: ${whatWorks.join(', ')}

Generate this exact JSON structure:
{
  "script_concepts": [
    {
      "title": "<catchy concept name>",
      "angle": "<the creative angle/approach>",
      "hook": "<opening hook line>",
      "outline": "<2-3 sentence script outline>"
    },
    // ... 3 total
  ],
  "alternative_hooks": [
    {
      "hook": "<the hook line>",
      "style": "<question|shock|relatable|controversial|curiosity|story|instruction>",
      "why_it_works": "<brief explanation>"
    },
    // ... 5 total, each a DIFFERENT style
  ],
  "product_categories": [
    {
      "category": "<product category name>",
      "reasoning": "<why this content style suits this category>",
      "example_product": "<a specific product type that would work>"
    },
    // ... 3 total
  ]
}

Make each recommendation specific and actionable. Hooks should be scroll-stoppers. Script concepts should be distinct creative angles, not variations of the same idea.`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('[recommendations] Claude error:', errText);
      return NextResponse.json({ error: 'AI generation failed.' }, { status: 500 });
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse AI response.' }, { status: 500 });
    }

    const recommendations = JSON.parse(jsonMatch[0]);

    const processingTimeMs = Date.now() - requestStart;
    await recordUsage(ip, userId, 'recommendation', processingTimeMs);

    return NextResponse.json(
      { ok: true, data: recommendations },
      {
        headers: {
          'X-RateLimit-Remaining': String(remaining === -1 ? -1 : remaining - 1),
          'X-RateLimit-Limit': String(limit),
        },
      }
    );
  } catch (err) {
    console.error('[recommendations] Error:', err);
    return NextResponse.json(
      { error: 'Failed to generate recommendations. Please try again.' },
      { status: 500 }
    );
  }
}
