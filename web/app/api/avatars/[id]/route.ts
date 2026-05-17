import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function ownedAvatar(userId: string, id: string) {
  const { data } = await supabaseAdmin.from('brand_profiles').select('*')
    .eq('id', id).eq('user_id', userId).eq('is_avatar', true).maybeSingle();
  return data;
}

async function ingestPhoto(imageUrl: string): Promise<string | null> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return null;
  try {
    const r = await fetch('https://api.heygen.com/v1/talking_photo', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    });
    if (!r.ok) return null;
    const j = await r.json() as { data?: { talking_photo_id?: string } };
    return j.data?.talking_photo_id || null;
  } catch { return null; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);
  const avatar = await ownedAvatar(auth.user.id, id);
  if (!avatar) return createApiErrorResponse('NOT_FOUND', 'avatar not found', 404, correlationId);
  const [{ data: scripts }, { data: campaigns }] = await Promise.all([
    supabaseAdmin.from('avatar_scripts').select('id, script_type, hook, status, render_video_url, created_at').eq('brand_profile_id', id).order('created_at', { ascending: false }).limit(20),
    supabaseAdmin.from('avatar_campaigns').select('id, name, product_name, goal, duration_days, status, created_at').eq('brand_profile_id', id).order('created_at', { ascending: false }).limit(10),
  ]);
  return NextResponse.json({ ok: true, avatar, scripts: scripts || [], campaigns: campaigns || [], correlation_id: correlationId });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);
  const avatar = await ownedAvatar(auth.user.id, id);
  if (!avatar) return createApiErrorResponse('NOT_FOUND', 'avatar not found', 404, correlationId);
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }
  const allowed = ['name','avatar_display_name','niche','personality','target_audience','avatar_appearance','avatar_visual_recipe','avatar_visual_reference_url','heygen_custom_avatar_id','voice_provider','voice_clone_id','tone_descriptor','prohibited_phrases','preferred_phrases','knowledge_bank','setup_status','test_render_url','avatar_video_style'];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) if (k in body) updates[k] = body[k];
  const newRefUrl = typeof body.avatar_visual_reference_url === 'string' ? body.avatar_visual_reference_url : null;
  if (newRefUrl && !avatar.heygen_custom_avatar_id && !newRefUrl.includes('dicebear.com')) {
    const tpId = await ingestPhoto(newRefUrl);
    if (tpId) updates.heygen_custom_avatar_id = tpId;
  }
  const { error } = await supabaseAdmin.from('brand_profiles').update(updates).eq('id', id).eq('user_id', auth.user.id);
  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  return NextResponse.json({ ok: true, ingested: !!updates.heygen_custom_avatar_id, correlation_id: correlationId });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);
  const { error } = await supabaseAdmin.from('brand_profiles').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', auth.user.id);
  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  return NextResponse.json({ ok: true });
}
