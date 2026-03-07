import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import OpenAI from 'openai';
import { logGenerationAsync } from '@/lib/flashflow/generations';
import { logUsageEventAsync } from '@/lib/finops/log-usage';
import { selectCategories, type HookCategory } from '@/lib/hooks/hook-categories';
import { filterHookBatch, checkHookQuality, type HookData } from '@/lib/hooks/hook-quality-filter';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Rate limiting by IP (simple in-memory cache)
const ipUsage = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, isAuthenticated: boolean): { allowed: boolean; remaining: number } {
  if (isAuthenticated) {
    return { allowed: true, remaining: 999 };
  }

  const now = Date.now();
  const usage = ipUsage.get(ip);

  if (!usage || usage.resetAt < now) {
    ipUsage.set(ip, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 });
    return { allowed: true, remaining: 2 };
  }

  if (usage.count >= 3) {
    return { allowed: false, remaining: 0 };
  }

  usage.count += 1;
  return { allowed: true, remaining: 3 - usage.count };
}

const PLATFORM_CONTEXT = {
  tiktok: 'TikTok Shop affiliate videos — maximum pattern interrupt, controversy-adjacent, fast pacing. The first 1-3 seconds decide everything.',
  youtube_shorts: 'YouTube Shorts — promise value upfront, slightly more context than TikTok, retention-focused. Build curiosity fast.',
  instagram_reels: 'Instagram Reels — aesthetic-forward visuals, aspirational tone, relatable moments. Visual appeal is critical.',
};

function buildCategoryBlock(categories: HookCategory[]): string {
  return categories
    .map((cat, i) => `Hook #${i + 1} — Category: "${cat.label}"\n  Angle: ${cat.description}\n  Visual direction example: ${cat.visualHint}\n  Verbal opener example: ${cat.verbalHint}`)
    .join('\n\n');
}

function buildSystemPrompt(
  platformContext: string,
  categories: HookCategory[],
  nicheContext: string,
  personaContext: string,
  toneCtx: string,
  audienceCtx: string,
  constraintsCtx: string,
): string {
  const categoryBlock = buildCategoryBlock(categories);

  return `You are an elite short-form video hook strategist who has studied thousands of top-performing TikToks, Reels, and Shorts. You understand what makes a viewer stop scrolling in 0.5 seconds.

YOUR JOB: Generate ${categories.length} hooks for the given product/topic. Each hook uses a DIFFERENT psychological category assigned below. Every hook must feel like something a real creator would actually film and say — not marketing copy.

ASSIGNED CATEGORIES (one per hook, in order):
${categoryBlock}

RULES — READ CAREFULLY:
1. The VISUAL HOOK must be a specific, filmable action or scene — not vague direction. Bad: "Person holding product." Good: "Close-up of hand squeezing the last drop out of an empty bottle, then tossing it in the trash."
2. TEXT ON SCREEN must create an open loop or tension. It should be scannable in under 2 seconds (max 12 words). Bad: "Check out this amazing product!" Good: "I was mass producing 3,000 of these until..."
3. VERBAL HOOK is the first words spoken — must sound natural, like a real person talking. No marketing speak. Bad: "This incredible product will transform your routine." Good: "Okay so my roommate just caught me doing this at 3am."
4. Each hook must use a DIFFERENT opening word/phrase — no two hooks can start the same way.
5. NEVER use these banned phrases: "this changed everything", "game changer", "you won't believe", "life hack", "wait for it", "changed my life", "mind blown", "best thing ever", "you need this", "trust me", "I'm obsessed", "holy grail", "must have", "hear me out".
6. NEVER start with: "So I just...", "Okay so...", "Hey guys...", "Guys,", "OMG guys".
7. WHY THIS WORKS must explain the specific psychological trigger in 1-2 sentences.

Platform: ${platformContext}
${nicheContext}${personaContext}${toneCtx}${audienceCtx}${constraintsCtx}

Return ONLY a valid JSON array of ${categories.length} hooks in this exact format:
[
  {
    "visual_hook": "...",
    "text_on_screen": "...",
    "verbal_hook": "...",
    "why_this_works": "...",
    "category": "${categories[0].id}"
  }
]

Use the exact category id from the assignments above. Do not include any markdown formatting or additional text — only the JSON array.`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const isAuthenticated = !!user;

    // Get IP for rate limiting
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateLimit = checkRateLimit(ip, isAuthenticated);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Sign up for unlimited access.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { product, platform = 'tiktok', niche = '', audience_persona_id, tone, audience, constraints } = body;

    if (!product || typeof product !== 'string' || product.trim().length === 0) {
      return NextResponse.json(
        { error: 'Product or topic is required' },
        { status: 400 }
      );
    }

    const platformContext = PLATFORM_CONTEXT[platform as keyof typeof PLATFORM_CONTEXT] || PLATFORM_CONTEXT.tiktok;
    const nicheContext = niche ? `\nNiche/Category: ${niche}` : '';
    const toneCtx = tone ? `\nTONE: Write in a ${tone} tone.` : '';
    const audienceCtx = audience ? `\nAUDIENCE: ${audience}` : '';
    const constraintsCtx = constraints ? `\nCONSTRAINTS: ${constraints}` : '';

    // Fetch persona context if provided
    let personaContext = '';
    if (audience_persona_id && typeof audience_persona_id === 'string') {
      const { data: persona } = await supabaseAdmin
        .from('audience_personas')
        .select('*')
        .eq('id', audience_persona_id)
        .single();

      if (persona) {
        const parts: string[] = [`Target Audience: "${persona.name}"`];
        if (persona.description) parts.push(`Who they are: ${persona.description}`);
        if (persona.age_range) parts.push(`Age: ${persona.age_range}`);
        if (persona.gender) parts.push(`Gender: ${persona.gender}`);
        if (persona.job_title) parts.push(`Job: ${persona.job_title}`);
        if (persona.life_stage) parts.push(`Life stage: ${persona.life_stage}`);
        if (persona.marital_status) parts.push(`Marital status: ${persona.marital_status}`);
        if (persona.kids_count) parts.push(`Kids: ${persona.kids_count}`);
        if (persona.goals?.length) parts.push(`Goals: ${persona.goals.join(', ')}`);
        if (persona.struggles?.length) parts.push(`Struggles: ${persona.struggles.join(', ')}`);
        if (persona.primary_pain_points?.length) parts.push(`Pain points: ${persona.primary_pain_points.join(', ')}`);
        if (persona.phrases_they_use?.length) parts.push(`How they talk: ${persona.phrases_they_use.slice(0, 3).map((p: string) => `"${p}"`).join(', ')}`);
        if (persona.tone_preference || persona.tone) parts.push(`Preferred tone: ${persona.tone_preference || persona.tone}`);
        if (persona.emotional_triggers?.length) parts.push(`Emotional triggers: ${persona.emotional_triggers.join(', ')}`);
        personaContext = `\n\nTARGET AUDIENCE PROFILE:\n${parts.join('\n')}\n\nIMPORTANT: Tailor every hook specifically to THIS person. Use their language, hit their pain points, match their tone.`;
      }
    }

    // Select categories for this batch
    const hookCount = 5;
    const categories = selectCategories(hookCount);

    const systemPrompt = buildSystemPrompt(
      platformContext,
      categories,
      nicheContext,
      personaContext,
      toneCtx,
      audienceCtx,
      constraintsCtx,
    );

    const userPrompt = `Product/Topic: ${product.trim()}`;

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let allPassedHooks: HookData[] = [];
    const maxAttempts = 2;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.85,
        max_tokens: 2500,
      });

      totalInputTokens += completion.usage?.prompt_tokens ?? 0;
      totalOutputTokens += completion.usage?.completion_tokens ?? 0;

      const responseText = completion.choices[0]?.message?.content?.trim() || '';

      let hooks: HookData[];
      try {
        const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        hooks = JSON.parse(jsonText);
      } catch {
        console.error('Failed to parse AI response on attempt', attempt + 1);
        continue;
      }

      if (!Array.isArray(hooks) || hooks.length === 0) continue;

      // Normalize: map strategy_note → why_this_works if needed
      hooks = hooks.map(h => ({
        visual_hook: h.visual_hook || '',
        text_on_screen: h.text_on_screen || '',
        verbal_hook: h.verbal_hook || '',
        strategy_note: h.why_this_works || h.strategy_note || '',
        category: h.category || '',
        why_this_works: h.why_this_works || h.strategy_note || '',
      }));

      // Validate structure
      hooks = hooks.filter(h =>
        h.visual_hook && h.text_on_screen && h.verbal_hook && (h.why_this_works || h.strategy_note)
      );

      // Apply quality + diversity filter
      const { passed } = filterHookBatch(hooks);
      allPassedHooks.push(...passed);

      // If we have enough good hooks, stop
      if (allPassedHooks.length >= hookCount) break;
    }

    if (allPassedHooks.length === 0) {
      return NextResponse.json(
        { error: 'Failed to generate quality hooks. Please try again.' },
        { status: 500 }
      );
    }

    // Take up to hookCount
    const finalHooks = allPassedHooks.slice(0, hookCount);

    // Log generation for self-improvement loop (fire-and-forget)
    if (user) {
      logGenerationAsync({
        user_id: user.id,
        template_id: 'hook_generate',
        prompt_version: '2.0.0',
        inputs_json: { product: product.trim(), platform, niche, audience_persona_id, tone, audience, constraints },
        output_text: JSON.stringify(finalHooks),
        model: 'gpt-4o-mini',
      });
    }

    // FinOps: log usage event with token counts
    logUsageEventAsync({
      source: 'flashflow',
      lane: 'FlashFlow',
      provider: 'openai',
      model: 'gpt-4o-mini',
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      user_id: user?.id,
      endpoint: '/api/hooks/generate',
      template_key: 'hook_generate',
      agent_id: 'flash',
    });

    return NextResponse.json({
      hooks: finalHooks,
      remaining: rateLimit.remaining,
    });

  } catch (error) {
    console.error('Error in hook generation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
