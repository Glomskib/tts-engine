/**
 * POST /api/visual-hooks/generate
 *
 * Generates specific, filmable visual hook ideas for the first 1-3 seconds.
 * Returns an array of VisualHookIdea objects, ranked strongest first.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { logUsageEventAsync } from '@/lib/finops/log-usage';
import { buildVisualHookPrompt, validateVisualHooks } from '@/lib/visual-hooks/generate';
import type { VisualHookRequest, VibeContext } from '@/lib/visual-hooks/types';
import { aiRouteGuard } from '@/lib/ai-route-guard';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const guard = await aiRouteGuard(request, { creditCost: 2, userLimit: 6 });
  if (guard.error) return guard.error;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { topic, platform, verbal_hook, script_context, niche, count, vibe } = body;

    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    // Build vibe context if provided
    let vibeCtx: VibeContext | undefined;
    if (vibe && typeof vibe === 'object' && (vibe.delivery_style || vibe.hook_energy || vibe.visual_rhythm)) {
      vibeCtx = vibe as VibeContext;
    }

    const req: VisualHookRequest = {
      topic: topic.trim(),
      platform: platform || 'tiktok',
      verbal_hook: verbal_hook || undefined,
      script_context: script_context || undefined,
      niche: niche || undefined,
      vibe: vibeCtx,
      count: Math.min(count || 6, 10),
    };

    const { system, user: userPrompt } = buildVisualHookPrompt(req);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.9,
      max_tokens: 2000,
    });

    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;

    const responseText = completion.choices[0]?.message?.content?.trim() || '';

    let parsed: unknown[];
    try {
      const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(jsonText);
    } catch {
      return NextResponse.json({ error: 'Failed to parse visual hooks — try again' }, { status: 500 });
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return NextResponse.json({ error: 'No visual hooks generated — try again' }, { status: 500 });
    }

    // Validate, score, and rank (strongest first)
    const ideas = validateVisualHooks(parsed, vibeCtx);

    if (ideas.length === 0) {
      return NextResponse.json({ error: 'Generated hooks were too generic — try again with more context' }, { status: 500 });
    }

    // FinOps tracking
    logUsageEventAsync({
      source: 'flashflow',
      lane: 'FlashFlow',
      provider: 'openai',
      model: 'gpt-4o-mini',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      user_id: user.id,
      endpoint: '/api/visual-hooks/generate',
      template_key: 'visual_hooks',
      agent_id: 'flash',
    });

    return NextResponse.json({ ideas });
  } catch (error) {
    console.error('Visual hook generation error:', error);
    return NextResponse.json({ error: 'Failed to generate visual hooks' }, { status: 500 });
  }
}
