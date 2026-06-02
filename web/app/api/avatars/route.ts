/**
 * /api/avatars — list + create avatar profiles.
 * Avatars are brand_profiles with is_avatar=true. They carry the avatar's
 * visual reference, voice clone, personality, and knowledge bank.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);

  const { data, error } = await supabaseAdmin
    .from('brand_profiles')
    .select('id, name, avatar_display_name, niche, personality, target_audience, avatar_visual_reference_url, heygen_custom_avatar_id, heygen_register_status, heygen_register_error, heygen_register_attempts, heygen_register_attempted_at, voice_provider, voice_preset_id, voice_clone_id, setup_status, test_render_url, active, created_at, updated_at')
    .eq('user_id', auth.user.id)
    .eq('is_avatar', true)
    .eq('active', true)
    .order('updated_at', { ascending: false });

  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  return NextResponse.json({ ok: true, avatars: data || [], correlation_id: correlationId });
}

export async function POST(req: NextRequest) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  const name = String(body.name || '').trim().slice(0, 200);
  if (!name) return createApiErrorResponse('VALIDATION_ERROR', 'name required', 400, correlationId);

  const insert = {
    user_id: auth.user.id,
    name,
    is_avatar: true,
    avatar_display_name: (body.avatar_display_name as string | undefined)?.slice(0, 200) || name,
    niche: (body.niche as string | undefined)?.slice(0, 500),
    personality: (body.personality as string | undefined)?.slice(0, 2000),
    target_audience: (body.target_audience as string | undefined)?.slice(0, 1000),
    avatar_appearance: (body.avatar_appearance as string | undefined)?.slice(0, 2000),
    avatar_visual_recipe: (body.avatar_visual_recipe as string | undefined)?.slice(0, 2000),
    tone_descriptor: (body.tone_descriptor as string | undefined)?.slice(0, 2000),
    prohibited_phrases: (body.prohibited_phrases as string | undefined)?.slice(0, 2000),
    preferred_phrases: (body.preferred_phrases as string | undefined)?.slice(0, 2000),
    knowledge_bank: body.knowledge_bank || {},
    voice_provider: (body.voice_provider as string | null | undefined) ?? null,
    voice_preset_id: (body.voice_preset_id as string | null | undefined) ?? null,
    voice_clone_id: (body.voice_clone_id as string | null | undefined) ?? null,
    setup_status: 'identity',
    active: true,
  };

  const { data, error } = await supabaseAdmin
    .from('brand_profiles')
    .insert(insert)
    .select('id')
    .single();

  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  return NextResponse.json({ ok: true, id: data.id, correlation_id: correlationId });
}
