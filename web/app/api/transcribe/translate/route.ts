import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { checkRateLimit, recordUsage } from '@/lib/transcribe-rate-limit';
import { aiRouteGuard } from '@/lib/ai-route-guard';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/transcribe/translate
 *
 * Translates a transcript into a target language using Claude Haiku.
 * Counts as 1 use from the shared transcriber rate limit pool.
 */
export async function POST(request: Request) {
  const guard = await aiRouteGuard(request, { creditCost: 2, userLimit: 6 });
  if (guard.error) return guard.error;

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
      { error: msg, signupUrl: userId ? undefined : '/login?mode=signup' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Limit': String(limit),
        },
      }
    );
  }

  let body: {
    transcript?: string;
    targetLanguage?: string;
    sourceLanguage?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { transcript, targetLanguage, sourceLanguage } = body;
  if (!transcript || typeof transcript !== 'string' || transcript.length < 10) {
    return NextResponse.json({ error: 'Transcript is required (min 10 characters).' }, { status: 400 });
  }
  if (!targetLanguage || typeof targetLanguage !== 'string') {
    return NextResponse.json({ error: 'Target language is required.' }, { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'AI service not configured.' }, { status: 500 });
  }

  const requestStart = Date.now();

  try {
    const sourceLine = sourceLanguage
      ? `The source language is ${sourceLanguage}.`
      : 'Detect the source language automatically.';

    const prompt = `You are a professional translator. Translate the following transcript into ${targetLanguage}. ${sourceLine}

TRANSCRIPT:
${transcript.slice(0, 5000)}

=== RULES ===
- Translate naturally, not literally — adapt idioms and expressions for the target language
- Preserve paragraph breaks and formatting from the original
- If the transcript contains slang or informal speech, keep a similar register in the translation
- Note any culturally-adapted idioms or expressions in the "notes" field

Return ONLY valid JSON in this exact format:
{
  "translated_text": "<full translated transcript>",
  "source_language": "<detected or provided source language>",
  "target_language": "${targetLanguage}",
  "notes": "<brief note about any idioms, cultural adaptations, or translation choices made>"
}`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('[translate] Claude error:', errText);
      return NextResponse.json({ error: 'AI translation failed.' }, { status: 500 });
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse AI response.' }, { status: 500 });
    }

    const translation = JSON.parse(jsonMatch[0]);

    const processingTimeMs = Date.now() - requestStart;
    await recordUsage(ip, userId, 'translation', processingTimeMs);

    return NextResponse.json(
      { ok: true, data: translation },
      {
        headers: {
          'X-RateLimit-Remaining': String(remaining === -1 ? -1 : remaining - 1),
          'X-RateLimit-Limit': String(limit),
        },
      }
    );
  } catch (err) {
    console.error('[translate] Error:', err);
    return NextResponse.json(
      { error: 'Failed to translate transcript. Please try again.' },
      { status: 500 }
    );
  }
}
