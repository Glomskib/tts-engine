/**
 * PATCH /api/avatars/[id]/voice
 *
 * Sets brand_profiles.voice_clone_id for an avatar the caller owns. Body:
 * { voice_id: string }. The voice_id is a HeyGen stock voice id; the render
 * path at /api/avatars/render/multi already reads voice_clone_id and passes
 * it to HeyGen as voice_id, so no other changes are required for picked
 * voices to flow into renders.
 *
 * 2026-06-01: added alongside the voice picker UI. Until now there was no
 * way to set this column from the app — every avatar showed "voice unset".
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const correlationId = generateCorrelationId();
  const { id: avatarId } = await params;

  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) {
    return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);
  }

  let body: { voice_id?: unknown } = {};
  try { body = await req.json(); } catch { /* fall through to validation */ }

  const voiceId = typeof body.voice_id === 'string' ? body.voice_id.trim() : '';
  if (!voiceId) {
    return createApiErrorResponse('VALIDATION_ERROR', 'voice_id is required', 400, correlationId);
  }

  // Ownership check — must be the caller's avatar.
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('brand_profiles')
    .select('id, user_id')
    .eq('id', avatarId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (profileErr || !profile) {
    return createApiErrorResponse('NOT_FOUND', 'Avatar not found', 404, correlationId);
  }

  const { error: updErr } = await supabaseAdmin
    .from('brand_profiles')
    .update({ voice_clone_id: voiceId })
    .eq('id', avatarId);

  if (updErr) {
    return createApiErrorResponse('DB_ERROR', `Could not save voice: ${updErr.message}`, 500, correlationId);
  }

  return NextResponse.json({ ok: true, voice_id: voiceId, correlation_id: correlationId });
}
