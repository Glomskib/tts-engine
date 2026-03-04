import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { checkRateLimit, recordUsage } from '@/lib/transcribe-rate-limit';
import { CUSTOMER_ARCHETYPES, VOICE_TONES, resolvePersona } from '@/lib/transcriber-personas';
import {
  buildOutlinePrompt,
  extractCtaKeywords,
  validateRegeneration,
} from '@/lib/regenerate-validation';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface PreviousRewrite {
  rewritten_hook: string;
  rewritten_script: string;
  cta: string;
}

/**
 * POST /api/transcribe/rewrite
 *
 * Rewrites a transcript in a specific persona voice and tone.
 * When previous_rewrite is provided, acts as a "variant rewrite" — same
 * talk track, different phrasing.
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
    previous_rewrite?: PreviousRewrite;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { transcript, persona, tone, custom_persona, analysis, previous_rewrite } = body;
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
  const isRegenerate = !!previous_rewrite?.rewritten_script;

  try {
    const hookLine = (analysis as Record<string, Record<string, string>>)?.hook?.line || '';
    const contentFormat = (analysis as Record<string, Record<string, string>>)?.content?.format || '';

    // Use the previous rewrite as the "source script" for regeneration,
    // or the original transcript for first-time rewrite
    const sourceScript = isRegenerate
      ? previous_rewrite!.rewritten_script
      : transcript.slice(0, 3000);

    const outline = buildOutlinePrompt(sourceScript);
    const sourceCta = isRegenerate ? previous_rewrite!.cta : '';
    const ctaKeywords = extractCtaKeywords(sourceCta);

    const prompt = isRegenerate
      ? buildRegeneratePrompt({
          transcript: transcript.slice(0, 3000),
          sourceScript,
          outline,
          sourceCta,
          ctaKeywords,
          hookLine: previous_rewrite!.rewritten_hook || hookLine,
          contentFormat,
          personaName,
          personaVoice,
          toneName: toneInfo.name,
          toneDesc: toneInfo.description,
          strict: false,
        })
      : buildFirstRewritePrompt({
          transcript: transcript.slice(0, 3000),
          outline,
          hookLine,
          contentFormat,
          personaName,
          personaVoice,
          toneName: toneInfo.name,
          toneDesc: toneInfo.description,
        });

    let rewrite = await callClaude(anthropicKey, prompt, 0.7);

    // Validation + auto-retry for regenerate mode
    if (isRegenerate && rewrite) {
      const validation = validateRegeneration(
        sourceScript,
        sourceCta,
        String(rewrite.rewritten_script || ''),
        String(rewrite.cta || '')
      );

      if (!validation.passed) {
        console.warn('[rewrite] Validation failed, retrying with strict prompt:', validation.details);

        const strictPrompt = buildRegeneratePrompt({
          transcript: transcript.slice(0, 3000),
          sourceScript,
          outline,
          sourceCta,
          ctaKeywords,
          hookLine: previous_rewrite!.rewritten_hook || hookLine,
          contentFormat,
          personaName,
          personaVoice,
          toneName: toneInfo.name,
          toneDesc: toneInfo.description,
          strict: true,
        });

        const retry = await callClaude(anthropicKey, strictPrompt, 0.4);
        if (retry) {
          rewrite = retry;
        }
      }
    }

    if (!rewrite) {
      return NextResponse.json({ error: 'Failed to parse AI response.' }, { status: 500 });
    }

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

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

interface RewritePromptArgs {
  transcript: string;
  outline: string;
  hookLine: string;
  contentFormat: string;
  personaName: string;
  personaVoice: string;
  toneName: string;
  toneDesc: string;
}

function buildFirstRewritePrompt(args: RewritePromptArgs): string {
  const { transcript, outline, hookLine, contentFormat, personaName, personaVoice, toneName, toneDesc } = args;

  return `You are a UGC script writer for TikTok/short-form video. Rewrite this transcript in the specified voice and tone while keeping the SAME talk track. Return ONLY valid JSON.

ORIGINAL TRANSCRIPT:
${transcript}

ORIGINAL HOOK: "${hookLine}"
CONTENT FORMAT: ${contentFormat}

SCRIPT OUTLINE (keep this structure):
${outline}

=== REWRITE AS THIS PERSONA ===
${personaName}: ${personaVoice}

=== VOICE & TONE ===
${toneName}: ${toneDesc}

=== RULES ===
- KEEP the same structure, sections, and sequence as the original
- KEEP the same topic, product, and core message
- KEEP the same CTA intent (same action you want the viewer to take)
- KEEP the length within +/- 15% of the original word count
- REWRITE the phrasing, word choice, and delivery style to match the persona
- The hook must be a scroll-stopper — 3 seconds or less
- Include [stage directions] in brackets where helpful
- on_screen_text should be 2-4 short overlays
- tips should be practical filming/delivery advice specific to this persona
- Do NOT introduce new sections or change the order of sections
- Do NOT change the topic or angle

Return this exact JSON:
{
  "rewritten_hook": "<new hook line — the scroll-stopper>",
  "rewritten_script": "<the full rewritten script including hook, body, and CTA>",
  "on_screen_text": ["<overlay 1>", "<overlay 2>", "<overlay 3>"],
  "cta": "<the call to action line>",
  "persona_used": "${personaName}",
  "tone_used": "${toneName}",
  "tips": ["<delivery tip 1>", "<delivery tip 2>", "<delivery tip 3>"]
}`;
}

interface RegeneratePromptArgs extends RewritePromptArgs {
  sourceScript: string;
  sourceCta: string;
  ctaKeywords: string[];
  strict: boolean;
}

function buildRegeneratePrompt(args: RegeneratePromptArgs): string {
  const {
    transcript, sourceScript, outline, sourceCta, ctaKeywords,
    hookLine, contentFormat, personaName, personaVoice, toneName, toneDesc, strict,
  } = args;

  const strictBlock = strict
    ? `
=== STRICT MODE — PREVIOUS ATTEMPT FAILED VALIDATION ===
Your previous attempt changed the talk track too much. This time you MUST:
- Match the section count EXACTLY (same number of paragraphs/beats)
- Include these CTA keywords somewhere in your script: ${ctaKeywords.join(', ')}
- Keep word count within ±15% of the original (${sourceScript.split(/\s+/).filter(Boolean).length} words)
- Do NOT add or remove sections. Only rephrase.
`
    : '';

  return `You are a UGC script writer for TikTok/short-form video. You are REGENERATING a script — producing a VARIANT of an existing rewrite. This is NOT a new script. Return ONLY valid JSON.

ORIGINAL TRANSCRIPT (for context):
${transcript}

=== CURRENT SCRIPT (rewrite this as a variant) ===
Hook: "${hookLine}"
Script:
${sourceScript}
CTA: "${sourceCta}"

SCRIPT OUTLINE (follow this structure exactly):
${outline}

=== REWRITE AS THIS PERSONA ===
${personaName}: ${personaVoice}

=== VOICE & TONE ===
${toneName}: ${toneDesc}

CONTENT FORMAT: ${contentFormat}
${strictBlock}
=== REGENERATION RULES ===
- This is a VARIANT REWRITE — same talk track, different words
- KEEP the exact same structure/sections and their order
- KEEP the same topic, product, angle, and core message
- KEEP the same CTA intent — the viewer should take the same action
- KEEP the length within +/- 15% of the current script
- REPHRASE the wording: improve hooks, punch up lines, vary rhythm
- Do NOT introduce new sections, topics, or angles
- Do NOT remove any existing sections
- Do NOT change the CTA to something different
- The hook should still be a scroll-stopper — 3 seconds or less
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
  "tone_used": "${toneName}",
  "tips": ["<delivery tip 1>", "<delivery tip 2>", "<delivery tip 3>"]
}`;
}

// ---------------------------------------------------------------------------
// Claude API helper
// ---------------------------------------------------------------------------

async function callClaude(
  apiKey: string,
  prompt: string,
  temperature: number
): Promise<Record<string, unknown> | null> {
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!claudeRes.ok) {
    const errText = await claudeRes.text();
    console.error('[rewrite] Claude error:', errText);
    return null;
  }

  const claudeData = await claudeRes.json();
  const text = claudeData.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  return JSON.parse(jsonMatch[0]);
}

// Re-export from shared module for any existing consumers
export { CUSTOMER_ARCHETYPES, VOICE_TONES } from '@/lib/transcriber-personas';
