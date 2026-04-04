/**
 * POST /api/admin/generator-eval
 *
 * Internal admin-only endpoint for evaluating hook and script generation.
 * Runs multiple generations with controlled inputs for side-by-side comparison.
 * No credit deduction, no rate limiting — evaluation use only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import OpenAI from 'openai';
import { selectCategories } from '@/lib/hooks/hook-categories';
import { filterHookBatch, type HookData } from '@/lib/hooks/hook-quality-filter';
import { buildVibePromptContext } from '@/lib/vibe-analysis/prompt-context';
import type { VibeAnalysis } from '@/lib/vibe-analysis/types';
import { fetchHookIntelligence, buildIntelligenceContext } from '@/lib/hooks/hook-intelligence';
import { punchUpHooks } from '@/lib/hooks/hook-punchup';
import { generateUnifiedScript, type UnifiedScriptInput } from '@/lib/unified-script-generator';

export const runtime = 'nodejs';
export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Types ─────────────────────────────────────────────────────────

interface EvalRequest {
  mode: 'hooks' | 'scripts';
  product: string;
  platform?: string;
  niche?: string;
  tone?: string;
  audience?: string;
  vibe_analysis?: Record<string, unknown>;
  /** For scripts: generate one per persona listed. For hooks: ignored. */
  personaIds?: string[];
  contentType?: string;
  targetLength?: string;
  /** Number of hook batches to generate (default: 2 for comparison) */
  hookBatches?: number;
  /** For scripts: enable punch-up pass */
  enablePunchUp?: boolean;
}

interface HookEvalResult {
  batchIndex: number;
  hooks: HookData[];
  meta: {
    categories: string[];
    hasVibe: boolean;
    hasIntelligence: boolean;
    punchedUp: boolean;
    generatedAt: string;
  };
}

interface ScriptEvalResult {
  personaId: string;
  personaName: string;
  output: {
    hook: string;
    setup: string;
    body: string;
    cta: string;
    spokenScript: string;
    onScreenText: string[];
    filmingNotes: string;
  };
  meta: {
    salesApproach: string;
    structureUsed: string;
    punchedUp: boolean;
    hasVibe: boolean;
    estimatedLength: string;
    generatedAt: string;
  };
}

// ── Hook generation (simplified from route, no rate limit) ────────

async function generateHookBatch(
  product: string,
  platform: string,
  niche: string,
  tone: string,
  audience: string,
  vibeAnalysis: VibeAnalysis | null,
  intel: ReturnType<typeof buildIntelligenceContext> extends string ? string : never,
): Promise<{ hooks: HookData[]; categories: string[]; punchedUp: boolean }> {
  const PLATFORM_CONTEXT: Record<string, string> = {
    tiktok: 'TikTok Shop affiliate videos — maximum pattern interrupt, controversy-adjacent, fast pacing.',
    youtube_shorts: 'YouTube Shorts — promise value upfront, retention-focused.',
    instagram_reels: 'Instagram Reels — aesthetic-forward visuals, aspirational tone.',
  };

  const hookCount = 5;
  const categories = selectCategories(hookCount);
  const categoryBlock = categories
    .map((cat, i) => `Hook #${i + 1} — Category: "${cat.label}"\n  Angle: ${cat.description}`)
    .join('\n\n');

  const platformCtx = PLATFORM_CONTEXT[platform] || PLATFORM_CONTEXT.tiktok;
  let vibeCtx = '';
  if (vibeAnalysis) {
    vibeCtx = '\n\n' + buildVibePromptContext(vibeAnalysis);
  }

  const systemPrompt = `You are an elite short-form video hook strategist.

Generate ${hookCount} hooks for the given product/topic. Each uses a DIFFERENT category.

CATEGORIES:\n${categoryBlock}

RULES:
1. Visual hook: specific, filmable action (min 5 words)
2. Text on screen: open loop/tension, max 12 words, DIFFERENT from verbal hook
3. Verbal hook: natural speech, not marketing copy (4-25 words)
4. Each hook uses a different opening word/phrase
5. NEVER use: "game changer", "life hack", "trust me", "I'm obsessed", "you need this", "hear me out", "holy grail"
6. WHY THIS WORKS: specific psychological trigger

Platform: ${platformCtx}
${niche ? `\nNiche: ${niche}` : ''}${tone ? `\nTone: ${tone}` : ''}${audience ? `\nAudience: ${audience}` : ''}${vibeCtx}${intel ? '\n\n' + intel : ''}

Return ONLY a JSON array: [{"visual_hook":"...","text_on_screen":"...","verbal_hook":"...","why_this_works":"...","category":"..."}]`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Product/Topic: ${product}` },
    ],
    temperature: 0.85,
    max_tokens: 2500,
  });

  const responseText = completion.choices[0]?.message?.content?.trim() || '';
  let hooks: HookData[];
  try {
    const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    hooks = JSON.parse(jsonText);
  } catch {
    return { hooks: [], categories: categories.map(c => c.id), punchedUp: false };
  }

  if (!Array.isArray(hooks)) return { hooks: [], categories: categories.map(c => c.id), punchedUp: false };

  hooks = hooks.map(h => ({
    visual_hook: h.visual_hook || '',
    text_on_screen: h.text_on_screen || '',
    verbal_hook: h.verbal_hook || '',
    strategy_note: h.why_this_works || h.strategy_note || '',
    category: h.category || '',
    why_this_works: h.why_this_works || h.strategy_note || '',
  })).filter(h => h.visual_hook && h.verbal_hook);

  const { passed } = filterHookBatch(hooks);
  let finalHooks = passed.slice(0, hookCount);

  // Punch-up pass
  let punchedUp = false;
  if (finalHooks.length >= 3) {
    const punchup = await punchUpHooks(finalHooks, product);
    if (punchup.punchedUp) {
      const { passed: pp } = filterHookBatch(punchup.hooks);
      if (pp.length >= finalHooks.length * 0.6) {
        finalHooks = pp.slice(0, hookCount);
        punchedUp = true;
      }
    }
  }

  return { hooks: finalHooks, categories: categories.map(c => c.id), punchedUp };
}

// ── POST handler ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);

  if (!auth.user || !auth.isAdmin) {
    return createApiErrorResponse('UNAUTHORIZED', 'Admin access required', 403, correlationId);
  }

  let body: EvalRequest;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  if (!body.product?.trim()) {
    return createApiErrorResponse('BAD_REQUEST', 'Product is required', 400, correlationId);
  }

  const vibeAnalysis = body.vibe_analysis?.delivery_style
    ? (body.vibe_analysis as unknown as VibeAnalysis)
    : null;

  try {
    if (body.mode === 'hooks') {
      // Generate multiple hook batches for comparison
      const batchCount = Math.min(body.hookBatches || 2, 4);
      const intel = await fetchHookIntelligence(body.niche || undefined);
      const intelligenceCtx = buildIntelligenceContext(intel);

      const results: HookEvalResult[] = [];
      for (let i = 0; i < batchCount; i++) {
        const batch = await generateHookBatch(
          body.product.trim(),
          body.platform || 'tiktok',
          body.niche || '',
          body.tone || '',
          body.audience || '',
          vibeAnalysis,
          intelligenceCtx,
        );
        results.push({
          batchIndex: i,
          hooks: batch.hooks,
          meta: {
            categories: batch.categories,
            hasVibe: !!vibeAnalysis,
            hasIntelligence: intelligenceCtx.length > 0,
            punchedUp: batch.punchedUp,
            generatedAt: new Date().toISOString(),
          },
        });
      }

      return NextResponse.json({ ok: true, mode: 'hooks', results, correlation_id: correlationId });

    } else if (body.mode === 'scripts') {
      // Generate one script per persona
      const personaIds = body.personaIds?.length
        ? body.personaIds
        : ['honest_reviewer', 'skeptic_convert', 'hype_man'];

      const results: ScriptEvalResult[] = [];
      for (const personaId of personaIds) {
        const scriptInput: UnifiedScriptInput = {
          productName: body.product.trim(),
          productCategory: body.niche || undefined,
          personaId,
          contentType: body.contentType || undefined,
          targetLength: (body.targetLength as UnifiedScriptInput['targetLength']) || '30_sec',
          vibeAnalysis: vibeAnalysis || undefined,
          enablePunchUp: body.enablePunchUp ?? true,
          callerContext: 'other',
          userId: auth.user.id,
        };

        const output = await generateUnifiedScript(scriptInput);

        results.push({
          personaId,
          personaName: output.persona,
          output: {
            hook: output.hook,
            setup: output.setup,
            body: output.body,
            cta: output.cta,
            spokenScript: output.spokenScript,
            onScreenText: output.onScreenText,
            filmingNotes: output.filmingNotes,
          },
          meta: {
            salesApproach: output.salesApproach,
            structureUsed: output.structureUsed || 'classic',
            punchedUp: output.punchedUp || false,
            hasVibe: !!vibeAnalysis,
            estimatedLength: output.estimatedLength,
            generatedAt: new Date().toISOString(),
          },
        });
      }

      return NextResponse.json({ ok: true, mode: 'scripts', results, correlation_id: correlationId });

    } else {
      return createApiErrorResponse('BAD_REQUEST', 'Mode must be "hooks" or "scripts"', 400, correlationId);
    }
  } catch (err) {
    console.error(`[${correlationId}] generator-eval error:`, err);
    return createApiErrorResponse(
      'AI_ERROR',
      err instanceof Error ? err.message : 'Evaluation generation failed',
      500,
      correlationId,
    );
  }
}
