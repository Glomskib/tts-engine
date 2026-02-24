import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { checkRateLimit, recordUsage } from '@/lib/transcribe-rate-limit';
import { CUSTOMER_ARCHETYPES, VOICE_TONES, resolvePersona } from '@/lib/transcriber-personas';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/transcribe/rewrite
 *
 * Rewrites a transcript in a specific persona voice and tone.
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
    persona?: string;
    tone?: string;
    custom_persona?: string;
    analysis?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { transcript, persona, tone, custom_persona, analysis } = body;
  if (!transcript || typeof transcript !== 'string' || transcript.length < 10) {
    return NextResponse.json({ error: 'Transcript is required.' }, { status: 400 });
  }
  if (!persona || !tone) {
    return NextResponse.json({ error: 'Persona and tone are required.' }, { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'AI service not configured.' }, { status: 500 });
  }

  // Resolve persona voice
  const resolved = resolvePersona(persona, custom_persona);
  if (!resolved) {
    return NextResponse.json({ error: 'Invalid persona.' }, { status: 400 });
  }
  const { name: personaName, voice: personaVoice } = resolved;

  const toneInfo = VOICE_TONES[tone];
  if (!toneInfo) {
    return NextResponse.json({ error: 'Invalid tone.' }, { status: 400 });
  }

  const requestStart = Date.now();

  try {
    const hookLine = (analysis as Record<string, Record<string, string>>)?.hook?.line || '';
    const contentFormat = (analysis as Record<string, Record<string, string>>)?.content?.format || '';

    const prompt = `You are a UGC script writer for TikTok/short-form video. Rewrite this transcript in the specified voice and tone. Return ONLY valid JSON.

ORIGINAL TRANSCRIPT:
${transcript.slice(0, 3000)}

ORIGINAL HOOK: "${hookLine}"
CONTENT FORMAT: ${contentFormat}

=== REWRITE AS THIS PERSONA ===
${personaName}: ${personaVoice}

=== VOICE & TONE ===
${toneInfo.name}: ${toneInfo.description}

=== RULES ===
- Keep the same core message/topic but rewrite it completely in the new voice
- The hook must be a scroll-stopper — 3 seconds or less
- Total script should be 30-60 seconds when read aloud (80-150 words)
- Include [stage directions] in brackets where helpful
- on_screen_text should be 2-4 short overlays
- tips should be practical filming/delivery advice specific to this persona

Return this exact JSON:
{
  "rewritten_hook": "<new hook line — the scroll-stopper>",
  "rewritten_script": "<the full rewritten script including hook, body, and CTA>",
  "on_screen_text": ["<overlay 1>", "<overlay 2>", "<overlay 3>"],
  "cta": "<the call to action line>",
  "persona_used": "${personaName}",
  "tone_used": "${toneInfo.name}",
  "tips": ["<delivery tip 1>", "<delivery tip 2>", "<delivery tip 3>"]
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
        max_tokens: 2000,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('[rewrite] Claude error:', errText);
      return NextResponse.json({ error: 'AI generation failed.' }, { status: 500 });
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse AI response.' }, { status: 500 });
    }

    const rewrite = JSON.parse(jsonMatch[0]);

    const processingTimeMs = Date.now() - requestStart;
    await recordUsage(ip, userId, 'rewrite', processingTimeMs);

    return NextResponse.json(
      { ok: true, data: rewrite },
      {
        headers: {
          'X-RateLimit-Remaining': String(remaining === -1 ? -1 : remaining - 1),
          'X-RateLimit-Limit': String(limit),
        },
      }
    );
  } catch (err) {
    console.error('[rewrite] Error:', err);
    return NextResponse.json(
      { error: 'Failed to rewrite script. Please try again.' },
      { status: 500 }
    );
  }
}

// Re-export from shared module for any existing consumers
export { CUSTOMER_ARCHETYPES, VOICE_TONES } from '@/lib/transcriber-personas';
