import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { aiRouteGuard } from '@/lib/ai-route-guard';

export const runtime = 'nodejs';
export const maxDuration = 30;

const PLATFORM_HINTS: Record<string, string> = {
  tiktok: 'TikTok (very short, punchy, emoji-friendly, conversational)',
  instagram: 'Instagram Reels (slightly more polished, hashtag-friendly)',
  youtube: 'YouTube Shorts (slightly longer is fine, CTA-friendly)',
};

const GOAL_HINTS: Record<string, string> = {
  drive_comments: 'spark replies and conversation (ask questions, be divisive, be relatable)',
  drive_saves: 'encourage saves (hint at value, tease more info, "save this for later")',
  drive_sales: 'push clicks and purchases (product tease, urgency, social proof)',
  drive_follows: 'earn follows (tease a content series, "part 2 coming", exclusive content)',
  build_trust: 'build trust and authority (behind the scenes, transparency, personal story)',
};

export async function POST(request: Request) {
  const guard = await aiRouteGuard(request, { creditCost: 1, userLimit: 15 });
  if (guard.error) return guard.error;

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let body: {
    topic?: string;
    platform?: string;
    goal?: string;
    product?: string;
    tone?: string;
    count?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { topic, platform = 'tiktok', goal = 'drive_comments', product, tone = 'casual', count = 5 } = body;

  if (!topic || typeof topic !== 'string' || topic.trim().length < 5) {
    return NextResponse.json({ error: 'Please describe your video topic (at least 5 characters).' }, { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'AI service not configured.' }, { status: 500 });
  }

  const platformHint = PLATFORM_HINTS[platform] || PLATFORM_HINTS.tiktok;
  const goalHint = GOAL_HINTS[goal] || GOAL_HINTS.drive_comments;
  const productLine = product ? `\nProduct/Brand being promoted: ${product}` : '';
  const safeCount = Math.min(Math.max(parseInt(String(count), 10) || 5, 3), 8);

  const systemPrompt = `You are an expert social media strategist who specializes in comment engineering — the art of crafting first pinned comments that drive viral engagement loops on short-form video platforms.

Your job: write ${safeCount} first comments a creator should pin on their own video immediately after posting. These comments are designed to be the FIRST thing viewers see in the comments section, which dramatically influences how they engage.

Rules:
- Each comment must feel AUTHENTIC and human, never like a brand or bot
- Write in ${tone} tone
- Optimized for: ${platformHint}
- Primary goal: ${goalHint}
- Vary the strategy: question, controversy, behind-the-scenes, social proof, CTA, cliffhanger, etc.
- Keep each comment SHORT (1-3 sentences max for TikTok/Reels, up to 4 for YouTube)
- Use emojis naturally, not excessively
- Do NOT mention "first comment" or "pinning this" in the text itself

Return ONLY valid JSON — no markdown, no explanation:
{
  "comments": [
    {
      "text": "<the full comment text>",
      "strategy": "<e.g. question, controversy, social proof, urgency, behind-the-scenes, cliffhanger>",
      "why": "<1 sentence: why this works>"
    }
  ]
}`;

  const userPrompt = `Video topic: ${topic.trim()}${productLine}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        temperature: 0.85,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[comment-creator] Claude error:', res.status, body.slice(0, 200));
      return NextResponse.json({ error: 'AI generation failed. Please try again.' }, { status: 502 });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[comment-creator] No JSON in response:', text.slice(0, 300));
      return NextResponse.json({ error: 'Failed to parse AI response. Please try again.' }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.comments) || parsed.comments.length === 0) {
      return NextResponse.json({ error: 'AI returned no comments. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ comments: parsed.comments });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comment-creator] Error:', msg);

    if (msg.includes('timed out') || msg.includes('AbortError')) {
      return NextResponse.json({ error: 'Request timed out. Please try again.' }, { status: 504 });
    }

    return NextResponse.json({ error: 'Failed to generate comments. Please try again.' }, { status: 500 });
  }
}
