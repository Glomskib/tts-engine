import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

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
    const { topic, contentType } = body;

    if (!topic || typeof topic !== 'string') {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = contentType === 'Hook Only'
      ? `Generate a viral TikTok hook (first 3 seconds) for: ${topic}\n\nProvide ONLY the hook text, no explanation.`
      : `Generate a ${contentType} TikTok script for: ${topic}\n\nFormat:\nHOOK: [First 3 seconds]\nBODY: [Main content]\nCTA: [Call to action]\n\nKeep it under 60 seconds of spoken content.`;

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

    return NextResponse.json({
      ok: true,
      script: text,
      contentType,
    });
  } catch (err: unknown) {
    console.error('Free generator error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
