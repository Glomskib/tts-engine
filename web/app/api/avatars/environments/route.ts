/**
 * /api/avatars/environments
 *
 * GET  — list all environment presets with their cached image_url (if generated).
 * POST — generate/fetch the background image for a preset and return its URL.
 *
 * POST body: { preset_id: string }
 * Returns:   { ok, preset_id, image_url }
 *
 * Images are global (not per-avatar) — one "office" background is shared
 * across all avatars. The first POST for a preset generates+caches it;
 * subsequent calls return the cached URL instantly.
 *
 * Auth: same pattern as /render/test (getApiAuthContext).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { ENVIRONMENT_PRESETS } from '@/lib/avatar-environments';
import { getOrCreateEnvironmentImage } from '@/lib/avatar-environment-images';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) {
    return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);
  }

  // Fetch all cached image URLs in one query.
  const { data: cached } = await supabaseAdmin
    .from('avatar_environment_assets')
    .select('preset_id, image_url');

  const cachedByPreset = new Map<string, string>(
    (cached || []).map((r: { preset_id: string; image_url: string }) => [r.preset_id, r.image_url]),
  );

  const presets = ENVIRONMENT_PRESETS.map((p) => ({
    ...p,
    image_url: cachedByPreset.get(p.id) ?? null,
  }));

  return NextResponse.json({ ok: true, presets, correlation_id: correlationId });
}

export async function POST(req: NextRequest) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) {
    return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);
  }

  let body: { preset_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  const presetId = (body.preset_id || '').trim();
  if (!presetId) {
    return createApiErrorResponse('VALIDATION_ERROR', 'preset_id required', 400, correlationId);
  }

  const preset = ENVIRONMENT_PRESETS.find((p) => p.id === presetId);
  if (!preset) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      `Unknown preset_id "${presetId}". Valid: ${ENVIRONMENT_PRESETS.map((p) => p.id).join(', ')}`,
      400,
      correlationId,
    );
  }

  // Plain preset has no image — return a synthetic response so the UI
  // can still "select" it without triggering generation.
  if (!preset.prompt) {
    return NextResponse.json({
      ok: true,
      preset_id: presetId,
      image_url: null,
      color: preset.fallbackColor,
      correlation_id: correlationId,
    });
  }

  try {
    const imageUrl = await getOrCreateEnvironmentImage(presetId);
    return NextResponse.json({ ok: true, preset_id: presetId, image_url: imageUrl, correlation_id: correlationId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return createApiErrorResponse('AI_ERROR', `Environment image generation failed: ${msg}`, 502, correlationId);
  }
}
