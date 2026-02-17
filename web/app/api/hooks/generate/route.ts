import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

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
  tiktok: 'TikTok Shop affiliate videos - Maximum pattern interrupt, controversy-adjacent, fast pacing. Focus on scroll-stopping moments.',
  youtube_shorts: 'YouTube Shorts - Promise value upfront, slightly more context than TikTok, retention-focused. Build curiosity.',
  instagram_reels: 'Instagram Reels - Aesthetic-forward visuals, aspirational tone, relatable moments. Visual appeal is critical.',
};

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
    const { product, platform = 'tiktok', niche = '' } = body;

    if (!product || typeof product !== 'string' || product.trim().length === 0) {
      return NextResponse.json(
        { error: 'Product or topic is required' },
        { status: 400 }
      );
    }

    const platformContext = PLATFORM_CONTEXT[platform as keyof typeof PLATFORM_CONTEXT] || PLATFORM_CONTEXT.tiktok;
    const nicheContext = niche ? `Niche/Category: ${niche}` : '';

    const systemPrompt = `You are an expert short-form video hook strategist.

Generate exactly 5 scroll-stopping hooks for the given product/topic.

Each hook MUST have exactly 3 parts designed to work together:

1. VISUAL HOOK (Scene Direction): A specific physical action, movement, prop interaction, or visual pattern interrupt that catches the eye in the first 0.5 seconds. Be specific — not "person talking to camera" but "Close-up of hand slamming laptop shut" or "POV: walking past 6 identical products to grab the one at the end"

2. TEXT ON SCREEN: Curiosity-driving overlay text that creates an open loop. Must make the viewer NEED to keep watching. Examples: "I was mass producing 3,000 of these a day until..." or "Day 1 vs Day 30 (wait for it)"

3. VERBAL HOOK (Opening Line): The first spoken words that either create intrigue, challenge a belief, or start a story. Must pair with the visual. Examples: "Okay but why is nobody talking about this?" or "I got fired for saying this on camera"

Platform context: ${platformContext}
${nicheContext}

Return ONLY a valid JSON array of 5 hooks in this exact format:
[
  {
    "visual_hook": "...",
    "text_on_screen": "...",
    "verbal_hook": "...",
    "strategy_note": "one sentence explaining why this combination works"
  }
]

Do not include any markdown formatting or additional text - only the JSON array.`;

    const userPrompt = `Product/Topic: ${product.trim()}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 2000,
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || '';
    
    // Try to parse JSON from response
    let hooks;
    try {
      // Remove markdown code blocks if present
      const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      hooks = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', responseText);
      return NextResponse.json(
        { error: 'Failed to generate valid hooks. Please try again.' },
        { status: 500 }
      );
    }

    if (!Array.isArray(hooks) || hooks.length === 0) {
      return NextResponse.json(
        { error: 'Failed to generate hooks. Please try again.' },
        { status: 500 }
      );
    }

    // Validate hook structure
    const validHooks = hooks.filter(hook => 
      hook.visual_hook && 
      hook.text_on_screen && 
      hook.verbal_hook && 
      hook.strategy_note
    );

    if (validHooks.length === 0) {
      return NextResponse.json(
        { error: 'Generated hooks were invalid. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      hooks: validHooks.slice(0, 5),
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
