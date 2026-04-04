import { NextResponse } from 'next/server';
import { validateApiAccess } from '@/lib/auth/validateApiAccess';
import { checkRateLimit, recordUsage } from '@/lib/transcribe-rate-limit';
import { VOICE_TONES, resolvePersona } from '@/lib/transcriber-personas';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { aiRouteGuard } from '@/lib/ai-route-guard';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface PreviousRewrite {
  rewritten_hook: string;
  rewritten_script: string;
  on_screen_text?: string[];
  cta: string;
  persona_used: string;
  tone_used: string;
}

/**
 * POST /api/transcribe/variation
 *
 * Creates a variation of an existing rewrite. Auto-saves the original if not
 * yet persisted, then generates a new take with the same persona/tone and
 * saves it as a child script (parent_id → original).
 */
export async function POST(request: Request) {
  const guard = await aiRouteGuard(request, { creditCost: 2, userLimit: 6 });
  if (guard.error) return guard.error;

  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';

  const auth = await validateApiAccess(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { allowed, remaining, limit } = await checkRateLimit(ip, auth.userId);
  if (!allowed) {
    return NextResponse.json(
      { error: "You've reached your daily AI limit. Check back tomorrow!" },
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
    analysis?: Record<string, unknown>;
    persona?: string;
    tone?: string;
    custom_persona?: string;
    previous_rewrite?: PreviousRewrite;
    original_concept_id?: string;
    source_url?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { transcript, analysis, persona, tone, custom_persona, previous_rewrite, original_concept_id, source_url } = body;

  if (!transcript || typeof transcript !== 'string' || transcript.length < 10) {
    return NextResponse.json({ error: 'Transcript is required.' }, { status: 400 });
  }
  if (!persona || !tone) {
    return NextResponse.json({ error: 'Persona and tone are required.' }, { status: 400 });
  }
  if (!previous_rewrite?.rewritten_script) {
    return NextResponse.json({ error: 'Previous rewrite is required.' }, { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'AI service not configured.' }, { status: 500 });
  }

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
    // ---- 1. Ensure original is persisted ----
    let conceptId = original_concept_id || null;
    let originalScriptId: string | null = null;

    if (!conceptId) {
      // Auto-save original: create concept + script
      const conceptTitle = source_url
        ? `Rewrite of ${source_url.replace('https://www.tiktok.com/', '').slice(0, 60)}`
        : `AI Rewrite — ${previous_rewrite.persona_used || 'Custom'}`;

      const { data: concept, error: conceptErr } = await supabaseAdmin
        .from('concepts')
        .insert({
          title: conceptTitle,
          core_angle: `${previous_rewrite.persona_used || 'Custom'} × ${previous_rewrite.tone_used || 'Conversational'}`,
          source_url: source_url || null,
          notes: `Generated via Transcriber AI Rewrite. Persona: ${previous_rewrite.persona_used}, Tone: ${previous_rewrite.tone_used}`,
          user_id: auth.userId,
        })
        .select('id')
        .single();

      if (conceptErr || !concept) {
        console.error('[variation] Concept insert error:', conceptErr);
        return NextResponse.json({ error: 'Failed to save original concept.' }, { status: 500 });
      }

      conceptId = concept.id;

      // Save the original script
      const { data: origScript, error: origScriptErr } = await supabaseAdmin
        .from('scripts')
        .insert({
          concept_id: conceptId,
          user_id: auth.userId,
          title: previous_rewrite.rewritten_hook
            ? `"${previous_rewrite.rewritten_hook.slice(0, 60)}"`
            : conceptTitle,
          spoken_script: previous_rewrite.rewritten_script,
          on_screen_text: previous_rewrite.on_screen_text?.join(' | ') || null,
          cta: previous_rewrite.cta || null,
          status: 'DRAFT',
          version: 1,
          created_by: auth.userId,
        })
        .select('id')
        .single();

      if (origScriptErr || !origScript) {
        console.error('[variation] Original script insert error:', origScriptErr);
        return NextResponse.json({ error: 'Failed to save original script.' }, { status: 500 });
      }

      originalScriptId = origScript.id;
    } else {
      // Concept already saved — find the script to link as parent
      const { data: existingScript } = await supabaseAdmin
        .from('scripts')
        .select('id')
        .eq('concept_id', conceptId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      originalScriptId = existingScript?.id || null;
    }

    // ---- 2. Call Claude for variation ----
    const hookLine = (analysis as Record<string, Record<string, string>>)?.hook?.line || '';
    const contentFormat = (analysis as Record<string, Record<string, string>>)?.content?.format || '';

    const prompt = `You are a UGC script writer for TikTok/short-form video. Create a VARIATION of the previous script — same persona, same topic, but a genuinely different take. Return ONLY valid JSON.

ORIGINAL TRANSCRIPT:
${transcript.slice(0, 3000)}

ORIGINAL HOOK: "${hookLine}"
CONTENT FORMAT: ${contentFormat}

=== PREVIOUS VERSION ===
Hook: "${previous_rewrite.rewritten_hook}"
Script: ${previous_rewrite.rewritten_script}
CTA: "${previous_rewrite.cta}"

=== WRITE AS THIS PERSONA ===
${personaName}: ${personaVoice}

=== VOICE & TONE ===
${toneInfo.name}: ${toneInfo.description}

=== VARIATION RULES ===
- Keep the hook TYPE (question, bold claim, story opener) but change the specific wording
- Keep overall structure/flow but vary phrasing, word choice, and examples
- Use different CTA wording with the same intent
- Do NOT just rephrase — make it feel like a genuinely different take on the same topic
- The hook must still be a scroll-stopper — 3 seconds or less
- Total script should be 30-60 seconds when read aloud (80-150 words)
- Include [stage directions] in brackets where helpful
- on_screen_text should be 2-4 short overlays (different from previous)
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
        temperature: 0.8, // slightly higher for more variation
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('[variation] Claude error:', errText);
      return NextResponse.json({ error: 'AI generation failed.' }, { status: 500 });
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse AI response.' }, { status: 500 });
    }

    const variation = JSON.parse(jsonMatch[0]);

    // ---- 3. Save variation as new script ----
    const { data: versionNum } = await supabaseAdmin.rpc('next_script_version', {
      p_concept_id: conceptId,
    });
    const nextVersion = versionNum ?? 2;

    const { error: varScriptErr } = await supabaseAdmin
      .from('scripts')
      .insert({
        concept_id: conceptId,
        user_id: auth.userId,
        title: variation.rewritten_hook
          ? `"${variation.rewritten_hook.slice(0, 60)}"`
          : `Variation v${nextVersion}`,
        spoken_script: variation.rewritten_script,
        on_screen_text: variation.on_screen_text?.join(' | ') || null,
        cta: variation.cta || null,
        status: 'DRAFT',
        version: nextVersion,
        parent_id: originalScriptId || null,
        created_by: auth.userId,
      });

    if (varScriptErr) {
      console.error('[variation] Variation script insert error:', varScriptErr);
      // Still return the variation even if save fails
    }

    const processingTimeMs = Date.now() - requestStart;
    await recordUsage(ip, auth.userId, 'rewrite', processingTimeMs);

    return NextResponse.json(
      {
        ok: true,
        data: variation,
        concept_id: conceptId,
        parent_script_id: originalScriptId,
      },
      {
        headers: {
          'X-RateLimit-Remaining': String(remaining === -1 ? -1 : remaining - 1),
          'X-RateLimit-Limit': String(limit),
        },
      }
    );
  } catch (err) {
    console.error('[variation] Error:', err);
    return NextResponse.json(
      { error: 'Failed to create variation. Please try again.' },
      { status: 500 }
    );
  }
}
