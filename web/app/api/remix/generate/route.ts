/**
 * POST /api/remix/generate
 *
 * Generates a remix from a video breakdown:
 *   1. Remix script (rewrite the viral format for the creator)
 *   2. Hooks (5 hooks inspired by the original)
 *   3. Visual hooks (4 visual ideas matching the original style)
 *
 * All three run in parallel via Promise.allSettled.
 * Reuses existing generation infrastructure — no new AI pipelines.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { aiRouteGuard } from '@/lib/ai-route-guard';
import { generateCorrelationId } from '@/lib/api-errors';
import { logUsageEventAsync } from '@/lib/finops/log-usage';
import { logEventSafe } from '@/lib/events-log';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { buildRemixPromptContext } from '@/lib/remix/context';
import type { RemixContext, RemixScript, RemixResult } from '@/lib/remix/types';
import type { PackHook, PackVisualHook } from '@/lib/content-pack/types';
import { selectCategories } from '@/lib/hooks/hook-categories';
import { filterHookBatch, type HookData } from '@/lib/hooks/hook-quality-filter';
import { buildVisualHookPrompt, validateVisualHooks } from '@/lib/visual-hooks/generate';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Remix Script Generation ──

async function generateRemixScript(
  ctx: RemixContext,
  userId?: string,
): Promise<{ script: RemixScript | null; tokens: { input: number; output: number } }> {
  const remixPromptCtx = buildRemixPromptContext(ctx);

  const systemPrompt = `You are rewriting a viral short-form video so the creator can post their own version.

${remixPromptCtx}

ORIGINAL TRANSCRIPT:
"${ctx.transcript.slice(0, 2000)}"

YOUR JOB: Write a NEW script that:
1. KEEPS the same structure, pacing, and psychological triggers that made the original work
2. CHANGES the wording completely — no copied lines from the original
3. Adapts the tone so it feels like the creator's own voice, not a carbon copy
4. Maintains the same hook energy level and reveal timing
5. Uses the same emotional arc but with fresh angles

RULES:
- Do NOT copy any phrases from the original transcript
- Keep the same approximate length and beat count
- The hook must match the original's energy level but use completely different words
- If the original uses a question hook, you can use a question — but a DIFFERENT question
- Filming notes should help a creator actually shoot this
- NEVER use banned phrases: "game changer", "changed my life", "trust me", "you need this", "hear me out"

Return ONLY valid JSON:
{
  "hook": "the opening hook line",
  "setup": "the setup/context section",
  "body": "the main content",
  "cta": "call to action",
  "full_script": "the complete spoken script from start to finish",
  "on_screen_text": ["text overlay 1", "text overlay 2"],
  "filming_notes": "practical notes for shooting this",
  "estimated_length": "15-30 seconds",
  "remix_notes": "what you changed and why — 1-2 sentences"
}`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { script: null, tokens: { input: 0, output: 0 } };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: systemPrompt }],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) return { script: null, tokens: { input: 0, output: 0 } };

  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  const usage = data.usage as { input_tokens?: number; output_tokens?: number } | undefined;
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;

  logUsageEventAsync({
    source: 'flashflow', lane: 'FlashFlow', provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    input_tokens: inputTokens, output_tokens: outputTokens,
    user_id: userId, endpoint: '/api/remix/generate', template_key: 'remix_script',
    agent_id: 'flash',
  });

  try {
    const jsonStr = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    if (!parsed.hook || !parsed.full_script) return { script: null, tokens: { input: inputTokens, output: outputTokens } };

    return {
      script: {
        hook: parsed.hook,
        setup: parsed.setup || '',
        body: parsed.body || '',
        cta: parsed.cta || '',
        full_script: parsed.full_script,
        on_screen_text: Array.isArray(parsed.on_screen_text) ? parsed.on_screen_text : [],
        filming_notes: parsed.filming_notes || '',
        estimated_length: parsed.estimated_length || '',
        remix_notes: parsed.remix_notes || '',
      },
      tokens: { input: inputTokens, output: outputTokens },
    };
  } catch {
    return { script: null, tokens: { input: inputTokens, output: outputTokens } };
  }
}

// ── Remix Hooks Generation ──

async function generateRemixHooks(
  ctx: RemixContext,
  userId?: string,
): Promise<{ hooks: PackHook[]; tokens: { input: number; output: number } }> {
  const categories = selectCategories(5);

  const categoryBlock = categories
    .map((cat, i) => `Hook #${i + 1} — Category: "${cat.label}"\n  Angle: ${cat.description}`)
    .join('\n\n');

  const systemPrompt = `You are generating alternative hooks for a creator who wants to remix a viral video.

ORIGINAL VIDEO HOOK: "${ctx.original_hook.line}"
Hook style: ${ctx.original_hook.style} (strength: ${ctx.original_hook.strength}/10)
Format: ${ctx.content.format}
${ctx.what_works.length > 0 ? `Why it works: ${ctx.what_works.join('; ')}` : ''}
${ctx.emotional_triggers.length > 0 ? `Emotional triggers: ${ctx.emotional_triggers.join(', ')}` : ''}

ASSIGNED CATEGORIES:
${categoryBlock}

RULES:
1. Each hook should capture the SAME psychological trigger as the original but with DIFFERENT words
2. VISUAL HOOK: specific, filmable action. Not vague.
3. TEXT ON SCREEN: scannable in <2 seconds, creates tension independent from verbal hook
4. VERBAL HOOK: natural human voice, not marketing copy
5. Each hook starts with a DIFFERENT opening word/phrase
6. NEVER copy phrases from the original hook
7. NEVER use banned phrases: "game changer", "changed my life", "trust me", "you need this", "hear me out", "hidden gem"

Return ONLY valid JSON array of 5 hooks:
[{"visual_hook":"...","text_on_screen":"...","verbal_hook":"...","why_this_works":"...","category":"${categories[0].id}"}]`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Topic: ${ctx.content.format} video about ${ctx.key_phrases.slice(0, 3).join(', ') || 'this topic'}` },
    ],
    temperature: 0.85,
    max_tokens: 2500,
  });

  const inputTokens = completion.usage?.prompt_tokens ?? 0;
  const outputTokens = completion.usage?.completion_tokens ?? 0;
  const text = completion.choices[0]?.message?.content?.trim() || '';

  logUsageEventAsync({
    source: 'flashflow', lane: 'FlashFlow', provider: 'openai', model: 'gpt-4o-mini',
    input_tokens: inputTokens, output_tokens: outputTokens,
    user_id: userId, endpoint: '/api/remix/generate', template_key: 'remix_hooks',
    agent_id: 'flash',
  });

  try {
    const json = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed: HookData[] = JSON.parse(json);
    if (!Array.isArray(parsed)) return { hooks: [], tokens: { input: inputTokens, output: outputTokens } };

    const normalized = parsed.map(h => ({
      visual_hook: h.visual_hook || '',
      text_on_screen: h.text_on_screen || '',
      verbal_hook: h.verbal_hook || '',
      strategy_note: h.why_this_works || h.strategy_note || '',
      category: h.category || '',
      why_this_works: h.why_this_works || h.strategy_note || '',
    })).filter(h => h.visual_hook && h.verbal_hook);

    const { passed } = filterHookBatch(normalized);

    return {
      hooks: passed.map(h => ({
        visual_hook: h.visual_hook,
        text_on_screen: h.text_on_screen,
        verbal_hook: h.verbal_hook,
        why_this_works: h.why_this_works || h.strategy_note,
        category: h.category,
      })),
      tokens: { input: inputTokens, output: outputTokens },
    };
  } catch {
    return { hooks: [], tokens: { input: inputTokens, output: outputTokens } };
  }
}

// ── Remix Visual Hooks Generation ──

async function generateRemixVisualHooks(
  ctx: RemixContext,
  userId?: string,
): Promise<{ ideas: PackVisualHook[]; tokens: { input: number; output: number } }> {
  const { system, user } = buildVisualHookPrompt({
    topic: ctx.key_phrases.slice(0, 3).join(', ') || 'this topic',
    platform: ctx.platform === 'youtube' ? 'youtube_shorts' : 'tiktok',
    verbal_hook: ctx.original_hook.line,
    vibe: ctx.vibe,
    count: 4,
  });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.9,
    max_tokens: 1500,
  });

  const inputTokens = completion.usage?.prompt_tokens ?? 0;
  const outputTokens = completion.usage?.completion_tokens ?? 0;
  const text = completion.choices[0]?.message?.content?.trim() || '';

  logUsageEventAsync({
    source: 'flashflow', lane: 'FlashFlow', provider: 'openai', model: 'gpt-4o-mini',
    input_tokens: inputTokens, output_tokens: outputTokens,
    user_id: userId, endpoint: '/api/remix/generate', template_key: 'remix_visual_hooks',
    agent_id: 'flash',
  });

  try {
    const json = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed: unknown[] = JSON.parse(json);
    if (!Array.isArray(parsed)) return { ideas: [], tokens: { input: inputTokens, output: outputTokens } };

    const validated = validateVisualHooks(parsed, ctx.vibe);
    return {
      ideas: validated.map(v => ({
        action: v.action,
        shot_type: v.shot_type,
        setup: v.setup,
        pairs_with: v.pairs_with,
        energy: v.energy,
        why_it_works: v.why_it_works,
        strength: v.strength,
      })),
      tokens: { input: inputTokens, output: outputTokens },
    };
  } catch {
    return { ideas: [], tokens: { input: inputTokens, output: outputTokens } };
  }
}

// ── Main Route ──

export async function POST(request: Request) {
  const guard = await aiRouteGuard(request, { creditCost: 3, userLimit: 5 });
  if (guard.error) return guard.error;
  const { correlationId, userId } = guard;

  let body: { remix_context: RemixContext };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const ctx = body.remix_context;
  if (!ctx || !ctx.transcript || !ctx.original_hook) {
    return NextResponse.json({ error: 'remix_context with transcript and original_hook is required' }, { status: 400 });
  }

  // Run all three in parallel
  const [scriptResult, hooksResult, visualResult] = await Promise.allSettled([
    generateRemixScript(ctx, userId),
    generateRemixHooks(ctx, userId),
    generateRemixVisualHooks(ctx, userId),
  ]);

  const script = scriptResult.status === 'fulfilled' ? scriptResult.value.script : null;
  const hooks = hooksResult.status === 'fulfilled' ? hooksResult.value.hooks : [];
  const visualHooks = visualResult.status === 'fulfilled' ? visualResult.value.ideas : [];

  const result: RemixResult = {
    script,
    hooks,
    visual_hooks: visualHooks,
    why_it_works: ctx.what_works,
    status: {
      script: script ? 'ok' : 'failed',
      hooks: hooks.length > 0 ? 'ok' : 'failed',
      visual_hooks: visualHooks.length > 0 ? 'ok' : 'failed',
    },
  };

  // Persist for logged-in users (fire-and-forget)
  let remixSessionId: string | null = null;
  if (userId) {
    try {
      const { data: inserted } = await supabaseAdmin
        .from('remix_sessions')
        .insert({
          workspace_id: userId,
          source_url: ctx.source_url,
          platform: ctx.platform,
          original_hook: ctx.original_hook.line,
          remix_script: script as unknown as Record<string, unknown>,
          hooks: hooks as unknown as Record<string, unknown>[],
          visual_hooks: visualHooks as unknown as Record<string, unknown>[],
          context: {
            original_hook: ctx.original_hook,
            content: ctx.content,
            key_phrases: ctx.key_phrases,
            emotional_triggers: ctx.emotional_triggers,
            what_works: ctx.what_works,
            target_emotion: ctx.target_emotion,
            duration: ctx.duration,
            vibe: ctx.vibe || null,
          },
        })
        .select('id')
        .single();

      remixSessionId = inserted?.id ?? null;

      // Log remix_created event (non-fatal)
      if (remixSessionId) {
        logEventSafe(supabaseAdmin, {
          entity_type: 'remix',
          entity_id: remixSessionId,
          event_type: 'remix_created',
          payload: {
            user_id: userId,
            platform: ctx.platform,
            source_url: ctx.source_url,
            script_ok: result.status.script === 'ok',
            hooks_count: hooks.length,
            visual_hooks_count: visualHooks.length,
          },
        });
      }
    } catch (err) {
      console.error('[remix] persistence failed:', err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({
    ok: true,
    data: result,
    remix_session_id: remixSessionId,
    correlation_id: correlationId,
  });
}
