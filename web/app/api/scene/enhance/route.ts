/**
 * /api/scene/enhance — turn a casual idea into a CINEMATIC, photoreal
 * Runway/Veo prompt. Text-to-video models live or die on prompt quality: a
 * one-line idea returns fake-looking mush; a detailed prompt with camera,
 * lens, lighting, materials, and natural motion returns photoreal results.
 * /scene calls this before sending to Runway so users get realism without
 * having to be prompt engineers.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM = `You are a prompt engineer for photorealistic AI video models (Runway Gen-4.5, Google Veo 3.1). Rewrite the user's idea into ONE vivid, hyper-realistic video-generation prompt.

Make it look and feel SUPER REAL — like real phone/camera footage, not CGI:
- Concrete subject + a single clear ACTION happening in real time (present tense).
- Camera: specify a real shot — "handheld phone footage", "slow gimbal push-in", "static tripod", "over-the-shoulder". Favor handheld/UGC realism for social content.
- Lens/framing: close-up, medium, wide — and depth of field ("shallow focus, blurred background").
- Lighting: name it — "soft natural window light", "warm golden-hour", "bright daylight", "moody softbox".
- Realism cues: natural skin texture, real materials and reflections, subtle imperfections, true-to-life motion and physics, candid expression, photorealistic, 4k, sharp.
- Setting details that ground it in reality.

Rules: ONE paragraph, present tense, concrete and specific, NO lists, NO meta-talk. Keep it UNDER 480 characters. Output ONLY the final prompt text, nothing else.`;

export async function POST(req: NextRequest) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return createApiErrorResponse('CONFIG_ERROR', 'ANTHROPIC_API_KEY missing', 503, correlationId);

  let body: { prompt?: string };
  try { body = await req.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  const idea = (body.prompt || '').trim();
  if (!idea) return createApiErrorResponse('VALIDATION_ERROR', 'prompt required', 400, correlationId);

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Idea: ${idea}\n\nWrite the photorealistic video prompt.` }],
    });
    const enhanced = msg.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { text: string }).text)
      .join(' ')
      .trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .slice(0, 500);
    if (!enhanced) throw new Error('empty enhancement');
    return NextResponse.json({ ok: true, enhanced, correlation_id: correlationId });
  } catch (e) {
    const m = e instanceof Error ? e.message : 'enhance failed';
    return createApiErrorResponse('AI_ERROR', m, 502, correlationId);
  }
}
