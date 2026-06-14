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

const SYSTEM = `You are a prompt engineer for photorealistic AI video models. Rewrite the user's idea into ONE vivid, hyper-realistic IMAGE-TO-VIDEO prompt.

CRITICAL — this is image-to-video: the user's uploaded photo is the FIRST FRAME. Your prompt must describe MOTION and ACTION applied to whatever is already in that photo — keep the same subject, product, face, and setting consistent; do NOT invent a different scene that contradicts the image. Describe how the existing subject moves, what they do with their hands/the product, and how the camera moves — the photo becomes alive, it does not become a new place.

Make it look and feel SUPER REAL — like real phone/camera footage, not CGI:
- A single clear ACTION the subject performs in real time (present tense): reaching, picking up, opening, using, reacting, turning to camera.
- Natural human motion + physics: real weight, real hand movement, believable timing, micro-expressions, blinking, subtle imperfection. Avoid stiff, floaty, or warping motion.
- Camera: name a real shot — "handheld phone footage", "slow gimbal push-in", "static tripod", "subtle handheld sway". Favor handheld/UGC realism.
- Lighting that matches the photo (don't fight it) — natural window light, warm indoor, bright daylight.
- Realism cues: natural skin texture, real materials and reflections, photorealistic, sharp, true-to-life.
- Keep hands and products stable and correctly shaped (a common failure point) — explicitly mention clean, natural hand movement.

Rules: ONE paragraph, present tense, concrete and specific, NO lists, NO meta-talk, NO model/brand names. Keep it UNDER 480 characters. Output ONLY the final prompt text.`;

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
