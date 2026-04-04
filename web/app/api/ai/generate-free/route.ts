import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { logUsageEventAsync } from '@/lib/finops/log-usage';
import { fetchHookIntelligence, buildIntelligenceContext } from '@/lib/hooks/hook-intelligence';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Simple in-memory rate limiting by IP (resets on server restart)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS_PER_HOUR = 5;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const existing = rateLimitMap.get(ip);

  if (!existing || now > existing.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }

  if (existing.count >= MAX_REQUESTS_PER_HOUR) {
    return false;
  }

  existing.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting by IP
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again in an hour or sign up for unlimited generations.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { topic } = body;

    if (!topic || typeof topic !== 'string' || topic.trim().length < 3 || topic.trim().length > 200) {
      return NextResponse.json({ error: 'Topic is required (3-200 characters)' }, { status: 400 });
    }

    // Allowlist contentType to prevent prompt injection
    const ALLOWED_CONTENT_TYPES = ['UGC Testimonial', 'Problem/Solution', 'Educational', 'Story/Testimonial', 'Direct Response', 'Hook Only'] as const;
    const contentType = ALLOWED_CONTENT_TYPES.includes(body.contentType) ? body.contentType : 'UGC Testimonial';

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Fetch hook intelligence (non-fatal, works for all users)
    let intelligenceSection = '';
    try {
      const intel = await fetchHookIntelligence(undefined);
      const ctx = buildIntelligenceContext(intel);
      if (ctx) intelligenceSection = '\n\n' + ctx;
    } catch { /* non-fatal */ }

    const hookRules = `\nHOOK RULES:
- Create a pattern interrupt — make the scroller STOP
- NEVER use: "game changer", "changed my life", "you need this", "trust me", "hear me out", "hidden gem", "run don't walk"
- NEVER start with: "So I just...", "Okay so...", "Hey guys...", "POV:", "Attention:"
- Sound like a real person, not marketing copy`;

    const safeTopic = topic.trim().slice(0, 200);

    const prompt = contentType === 'Hook Only'
      ? `You are an elite short-form video hook strategist. Generate a viral TikTok hook (first 3 seconds) for: ${safeTopic}\n${hookRules}${intelligenceSection}\n\nProvide ONLY the hook text, no explanation.`
      : `You are an elite short-form video script writer. Generate a ${contentType} TikTok script for: ${safeTopic}\n${hookRules}${intelligenceSection}\n\nFormat:\nHOOK: [First 3 seconds — pattern interrupt, specific, filmable]\nBODY: [Main content — entertaining, not salesy]\nCTA: [Natural call to action]\n\nKeep it under 60 seconds of spoken content. Write like a real creator, not a brand.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 1024,
      temperature: 0.7,
    });

    const text = completion.choices[0]?.message?.content || '';

    // FinOps: log usage (fire-and-forget)
    logUsageEventAsync({
      source: 'flashflow',
      lane: 'FlashFlow',
      provider: 'openai',
      model: 'gpt-4o-mini',
      input_tokens: completion.usage?.prompt_tokens ?? 0,
      output_tokens: completion.usage?.completion_tokens ?? 0,
      endpoint: '/api/ai/generate-free',
      template_key: 'generate_free',
      metadata: completion.usage ? {} : { usage: 'missing' },
    });

    return NextResponse.json({
      ok: true,
      script: text,
      contentType,
    });
  } catch (err: unknown) {
    console.error('Free generator error:', err);
    return NextResponse.json(
      { error: 'Generation failed. Please try again.' },
      { status: 500 }
    );
  }
}
