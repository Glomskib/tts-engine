/**
 * POST /api/launch-sync/demo
 *
 * Free, unauthenticated demo endpoint for the landing page.
 * Generates hooks + 1 script preview for any product.
 * Rate-limited by IP to prevent abuse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { callAnthropicJSON } from '@/lib/ai/anthropic';
import { logEventSafe } from '@/lib/events-log';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

// Simple in-memory rate limit (resets on deploy)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_DEMO_PER_HOUR = 5;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= MAX_DEMO_PER_HOUR) return false;
  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Sign up for unlimited access.' },
      { status: 429 }
    );
  }

  let body: { input: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const input = body.input?.trim();
  if (!input || input.length < 3) {
    return NextResponse.json({ ok: false, error: 'Input too short' }, { status: 400 });
  }

  // Extract product context from URL or name
  const isUrl = input.startsWith('http');
  const productContext = isUrl
    ? `Amazon product URL: ${input}`
    : `Product name: ${input}`;

  const prompt = `You are a TikTok content strategist. Generate content seeds for this product.

${productContext}

Return JSON:
{
  "product_name": "clean product name",
  "hooks": [
    {"text": "hook text", "angle": "angle name", "style": "educational|shock|relatable|storytime|pov"}
  ],
  "scripts": [
    {"title": "short title", "hook": "opening hook", "body": "3-5 sentence body with visual direction", "cta": "call to action", "tone": "energetic|calm|funny|serious|relatable"}
  ]
}

Rules:
- Generate exactly 5 hooks with different angles
- Generate exactly 1 script (this is a preview — full version requires signup)
- Focus on TikTok-native formats: pattern interrupts, curiosity gaps, relatable pain points
- Be specific and actionable, not generic
- Return ONLY valid JSON`;

  try {
    const { parsed } = await callAnthropicJSON<{
      product_name: string;
      hooks: { text: string; angle: string; style: string }[];
      scripts: { title: string; hook: string; body: string; cta: string; tone: string }[];
    }>(prompt, {
      maxTokens: 1500,
      agentId: 'launch-sync-demo',
      requestType: 'demo',
    });

    // Log demo usage for analytics (non-blocking)
    logEventSafe(supabaseAdmin, {
      entity_type: 'launch_sync',
      entity_id: 'demo',
      event_type: 'demo_generated',
      payload: {
        input: input.slice(0, 200),
        product_name: parsed.product_name,
        hooks_count: parsed.hooks?.length || 0,
        ip_hash: ip.split('.').slice(0, 2).join('.') + '.x.x', // partial IP for privacy
      },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      data: {
        product_name: parsed.product_name,
        hooks: parsed.hooks || [],
        scripts: parsed.scripts || [],
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: 'Generation failed. Please try again.' },
      { status: 500 }
    );
  }
}
