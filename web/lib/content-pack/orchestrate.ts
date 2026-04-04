/**
 * Content Pack Orchestrator
 *
 * Generates a complete creative starting pack by orchestrating:
 *   1. Hook generation (5 hooks via hook generator logic)
 *   2. Script generation (via unified script generator)
 *   3. Visual hook ideas (via visual hooks generator)
 *
 * All three run in parallel. Partial failure is graceful — if one
 * component fails, the pack still returns with what succeeded.
 */

import { generateUnifiedScript } from '@/lib/unified-script-generator';
import type { UnifiedScriptInput, UnifiedScriptOutput } from '@/lib/unified-script-generator';
import { buildVisualHookPrompt, validateVisualHooks } from '@/lib/visual-hooks/generate';
import type { ContentPackInput, ContentPack, PackHook, PackScript, PackVisualHook } from './types';
import OpenAI from 'openai';
import { selectCategories } from '@/lib/hooks/hook-categories';
import { filterHookBatch, type HookData } from '@/lib/hooks/hook-quality-filter';
import { logUsageEventAsync } from '@/lib/finops/log-usage';
import { fetchPerformanceContext } from '@/lib/creator-performance/build-prompt-context';
import { getAudienceKnowledgeContext } from '@/lib/knowledge-graph/retrieve';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Hook generation (server-side, mirrors /api/hooks/generate logic) ──

const PLATFORM_HOOK_CONTEXT: Record<string, string> = {
  tiktok: 'TikTok Shop affiliate videos — maximum pattern interrupt, controversy-adjacent, fast pacing. The first 1-3 seconds decide everything.',
  youtube_shorts: 'YouTube Shorts — promise value upfront, slightly more context than TikTok, retention-focused. Build curiosity fast.',
  instagram_reels: 'Instagram Reels — aesthetic-forward visuals, aspirational tone, relatable moments. Visual appeal is critical.',
};

async function generateHooks(input: ContentPackInput, userId?: string): Promise<{ hooks: PackHook[]; tokens: { input: number; output: number } }> {
  const categories = selectCategories(5);
  const platformCtx = PLATFORM_HOOK_CONTEXT[input.platform || 'tiktok'] || PLATFORM_HOOK_CONTEXT.tiktok;

  // Fetch creator performance + knowledge context if available
  let perfSection = '';
  if (userId) {
    try {
      const [perfCtx, audienceCtx] = await Promise.all([
        fetchPerformanceContext(userId).catch(() => ({ prompt: '', hasData: false })),
        getAudienceKnowledgeContext(userId).catch(() => ({ prompt: '', hasData: false, nodeCount: 0 })),
      ]);
      if (perfCtx.hasData) perfSection += '\n\n' + perfCtx.prompt;
      if (audienceCtx.hasData) perfSection += '\n\n' + audienceCtx.prompt;
    } catch { /* non-fatal */ }
  }

  const categoryBlock = categories
    .map((cat, i) => `Hook #${i + 1} — Category: "${cat.label}"\n  Angle: ${cat.description}\n  Visual direction example: ${cat.visualHint}\n  Verbal opener example: ${cat.verbalHint}`)
    .join('\n\n');

  const systemPrompt = `You are an elite short-form video hook strategist. Generate 5 hooks for the given product/topic.

ASSIGNED CATEGORIES (one per hook):
${categoryBlock}

RULES:
1. VISUAL HOOK must be specific, filmable action — not vague. Bad: "Person holding product." Good: "Close-up of hand squeezing the last drop out of an empty bottle."
2. TEXT ON SCREEN: scannable in <2 seconds (max 12 words), creates tension independent from verbal hook.
3. VERBAL HOOK: first words spoken, natural human voice, not marketing copy.
4. Each hook starts with a DIFFERENT opening word/phrase.
5. NEVER use banned phrases: "game changer", "changed my life", "trust me", "you need this", "hidden gem", "run don't walk", "hear me out".
6. WHY THIS WORKS: 1-2 sentence explanation of psychological trigger.

Platform: ${platformCtx}
${input.niche ? `Niche: ${input.niche}` : ''}
${input.seed_hook ? `Reference hook to riff on: "${input.seed_hook}"` : ''}
${input.context ? `Context: ${input.context}` : ''}${perfSection}

Return ONLY a valid JSON array of 5 hooks:
[{"visual_hook":"...","text_on_screen":"...","verbal_hook":"...","why_this_works":"...","category":"${categories[0].id}"}]`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Product/Topic: ${input.topic}` },
    ],
    temperature: 0.85,
    max_tokens: 2500,
  });

  const inputTokens = completion.usage?.prompt_tokens ?? 0;
  const outputTokens = completion.usage?.completion_tokens ?? 0;
  const text = completion.choices[0]?.message?.content?.trim() || '';

  let parsed: HookData[];
  try {
    const json = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(json);
  } catch {
    return { hooks: [], tokens: { input: inputTokens, output: outputTokens } };
  }

  if (!Array.isArray(parsed)) return { hooks: [], tokens: { input: inputTokens, output: outputTokens } };

  // Normalize and filter
  const normalized = parsed.map(h => ({
    visual_hook: h.visual_hook || '',
    text_on_screen: h.text_on_screen || '',
    verbal_hook: h.verbal_hook || '',
    strategy_note: h.why_this_works || h.strategy_note || '',
    category: h.category || '',
    why_this_works: h.why_this_works || h.strategy_note || '',
  })).filter(h => h.visual_hook && h.verbal_hook);

  const { passed } = filterHookBatch(normalized);

  logUsageEventAsync({
    source: 'flashflow', lane: 'FlashFlow', provider: 'openai', model: 'gpt-4o-mini',
    input_tokens: inputTokens, output_tokens: outputTokens,
    user_id: userId, endpoint: '/api/content-pack/generate', template_key: 'content_pack_hooks', agent_id: 'flash',
  });

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
}

// ── Script generation (via unified script generator) ──

async function generateScript(input: ContentPackInput, userId?: string): Promise<PackScript | null> {
  try {
    const scriptInput: UnifiedScriptInput = {
      productName: input.topic,
      productId: input.product_id,
      userId,
      hookText: input.seed_hook,
      targetLength: '30_sec',
      callerContext: 'content_package',
      enablePunchUp: true,
    };

    // Pass vibe analysis if available
    if (input.vibe && input.vibe.delivery_style) {
      // The unified generator expects the full VibeAnalysis type.
      // We pass what we have — it's permissive.
      scriptInput.vibeAnalysis = input.vibe as unknown as import('@/lib/vibe-analysis/types').VibeAnalysis;
    }

    const result: UnifiedScriptOutput = await generateUnifiedScript(scriptInput);

    return {
      hook: result.hook,
      setup: result.setup,
      body: result.body,
      cta: result.cta,
      full_script: result.spokenScript,
      on_screen_text: result.onScreenText,
      filming_notes: result.filmingNotes,
      caption: result.caption,
      hashtags: result.hashtags,
      persona: result.persona,
      sales_approach: result.salesApproach,
      structure_used: result.structureUsed,
      estimated_length: result.estimatedLength,
    };
  } catch (err) {
    console.error('Content pack script generation failed:', err);
    return null;
  }
}

// ── Visual hooks generation (server-side) ──

async function generateVisualHooks(input: ContentPackInput, userId?: string): Promise<{ ideas: PackVisualHook[]; tokens: { input: number; output: number } }> {
  const { system, user } = buildVisualHookPrompt({
    topic: input.topic,
    platform: input.platform || 'tiktok',
    verbal_hook: input.seed_hook,
    niche: input.niche,
    vibe: input.vibe,
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

  let parsed: unknown[];
  try {
    const json = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(json);
  } catch {
    return { ideas: [], tokens: { input: inputTokens, output: outputTokens } };
  }

  if (!Array.isArray(parsed)) return { ideas: [], tokens: { input: inputTokens, output: outputTokens } };

  const validated = validateVisualHooks(parsed, input.vibe);

  logUsageEventAsync({
    source: 'flashflow', lane: 'FlashFlow', provider: 'openai', model: 'gpt-4o-mini',
    input_tokens: inputTokens, output_tokens: outputTokens,
    user_id: userId, endpoint: '/api/content-pack/generate', template_key: 'content_pack_visual_hooks', agent_id: 'flash',
  });

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
}

// ── Title/caption variants from script ──

function deriveTitleVariants(script: PackScript | null, hooks: PackHook[]): string[] {
  const variants: string[] = [];

  // From script caption
  if (script?.caption) {
    variants.push(script.caption);
  }

  // From hook verbal hooks (top 2)
  for (const hook of hooks.slice(0, 2)) {
    if (hook.verbal_hook) {
      variants.push(hook.verbal_hook);
    }
  }

  // From text on screen hooks (top 2)
  for (const hook of hooks.slice(0, 2)) {
    if (hook.text_on_screen) {
      variants.push(hook.text_on_screen);
    }
  }

  return variants.slice(0, 5);
}

// ── Single-component regeneration ──

export async function regeneratePackComponent(
  existing: {
    topic: string;
    source_type: string;
    hooks: PackHook[];
    script: PackScript | null;
    visual_hooks: PackVisualHook[];
    meta: ContentPack['meta'];
    status: ContentPack['status'];
  },
  component: 'hooks' | 'script' | 'visual_hooks',
  userId: string,
): Promise<{ data: PackHook[] | PackScript | null | PackVisualHook[]; status: ContentPack['status']; title_variants?: string[] }> {
  const input: ContentPackInput = {
    source_type: existing.source_type as ContentPackInput['source_type'],
    topic: existing.topic,
    seed_hook: existing.meta.seed_hook,
    context: existing.meta.context,
    platform: (existing.meta.platform as ContentPackInput['platform']) || 'tiktok',
    niche: existing.meta.niche,
  };

  const newStatus = { ...existing.status };

  if (component === 'hooks') {
    try {
      const result = await generateHooks(input, userId);
      newStatus.hooks = result.hooks.length > 0 ? 'ok' : 'failed';
      const titleVariants = deriveTitleVariants(existing.script, result.hooks);
      return { data: result.hooks, status: newStatus, title_variants: titleVariants };
    } catch {
      newStatus.hooks = 'failed';
      return { data: existing.hooks, status: newStatus };
    }
  }

  if (component === 'script') {
    try {
      const result = await generateScript(input, userId);
      newStatus.script = result ? 'ok' : 'failed';
      const titleVariants = deriveTitleVariants(result, existing.hooks);
      return { data: result, status: newStatus, title_variants: titleVariants };
    } catch {
      newStatus.script = 'failed';
      return { data: existing.script, status: newStatus };
    }
  }

  // visual_hooks
  try {
    const result = await generateVisualHooks(input, userId);
    newStatus.visual_hooks = result.ideas.length > 0 ? 'ok' : 'failed';
    return { data: result.ideas, status: newStatus };
  } catch {
    newStatus.visual_hooks = 'failed';
    return { data: existing.visual_hooks, status: newStatus };
  }
}

// ── Main orchestrator ──

export async function orchestrateContentPack(
  input: ContentPackInput,
  userId: string,
): Promise<Omit<ContentPack, 'id' | 'created_at'>> {
  // Run all three in parallel — graceful degradation if one fails
  const [hookResult, scriptResult, visualResult] = await Promise.allSettled([
    generateHooks(input, userId),
    generateScript(input, userId),
    generateVisualHooks(input, userId),
  ]);

  const hooks = hookResult.status === 'fulfilled' ? hookResult.value.hooks : [];
  const script = scriptResult.status === 'fulfilled' ? scriptResult.value : null;
  const visualHooks = visualResult.status === 'fulfilled' ? visualResult.value.ideas : [];

  const titleVariants = deriveTitleVariants(script, hooks);

  return {
    user_id: userId,
    source_type: input.source_type,
    topic: input.topic,
    hooks,
    script,
    visual_hooks: visualHooks,
    title_variants: titleVariants,
    meta: {
      platform: input.platform || 'tiktok',
      niche: input.niche,
      persona_used: script?.persona,
      structure_used: script?.structure_used,
      vibe_used: !!(input.vibe && input.vibe.delivery_style),
      seed_hook: input.seed_hook,
      context: input.context,
    },
    status: {
      hooks: hookResult.status === 'fulfilled' && hooks.length > 0 ? 'ok' : hooks.length === 0 && hookResult.status === 'fulfilled' ? 'failed' : 'failed',
      script: scriptResult.status === 'fulfilled' && script ? 'ok' : 'failed',
      visual_hooks: visualResult.status === 'fulfilled' && visualHooks.length > 0 ? 'ok' : visualHooks.length === 0 && visualResult.status === 'fulfilled' ? 'failed' : 'failed',
    },
  };
}
