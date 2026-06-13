import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { resolveHeyGenBackground } from '@/lib/avatar-environments';
import type { EnvironmentSelection } from '@/lib/avatar-environments';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return createApiErrorResponse('CONFIG_ERROR', 'Render preview unavailable.', 503, correlationId);
  const { data: avatar } = await supabaseAdmin.from('brand_profiles')
    .select('id, avatar_display_name, name, heygen_custom_avatar_id, voice_clone_id, voice_provider, avatar_environment_json')
    .eq('id', id).eq('user_id', auth.user.id).maybeSingle();
  if (!avatar) return createApiErrorResponse('NOT_FOUND', 'avatar not found', 404, correlationId);
  if (!avatar.heygen_custom_avatar_id) {
    return createApiErrorResponse('PRECONDITION_FAILED', 'Add a real reference photo first (the illustrated starter is just a placeholder).', 400, correlationId);
  }
  let body: { line?: string } = {};
  try { body = await req.json(); } catch {}
  const displayName = avatar.avatar_display_name || avatar.name || 'your avatar';
  const line = (body.line || `Hi, I'm ${displayName}. Let me show you something.`).slice(0, 300);
  const background = resolveHeyGenBackground(
    (avatar as unknown as { avatar_environment_json?: EnvironmentSelection | null }).avatar_environment_json,
  );
  const r = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      video_inputs: [{
        character: { type: 'talking_photo', talking_photo_id: avatar.heygen_custom_avatar_id },
        voice: { type: 'text', input_text: line, voice_id: avatar.voice_clone_id || 'd7bbcdd6964c47bdaae26decade4a933' },
        background,
      }],
      dimension: { width: 720, height: 1280 },
      test: true,
    }),
  });
  if (!r.ok) {
    console.error('[render/test] upstream:', await r.text().catch(() => ''));
    return createApiErrorResponse('AI_ERROR', 'Render preview unavailable. Try again in a moment.', 502, correlationId);
  }
  const j = await r.json() as { data?: { video_id?: string } };
  if (!j.data?.video_id) return createApiErrorResponse('AI_ERROR', 'Render preview unavailable.', 502, correlationId);
  return NextResponse.json({ ok: true, heygen_video_id: j.data.video_id, status: 'pending', correlation_id: correlationId });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return createApiErrorResponse('CONFIG_ERROR', 'Render unavailable', 503, correlationId);
  const url = new URL(req.url);
  const videoId = url.searchParams.get('video_id');
  if (!videoId) return createApiErrorResponse('VALIDATION_ERROR', 'video_id required', 400, correlationId);
  const r = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, { headers: { 'X-Api-Key': apiKey } });
  if (!r.ok) return createApiErrorResponse('AI_ERROR', 'Status unavailable', 502, correlationId);
  const j = await r.json() as { data?: { status?: string; video_url?: string; thumbnail_url?: string } };
  if (j.data?.status === 'completed' && j.data.video_url) {
    await supabaseAdmin.from('brand_profiles')
      .update({ test_render_url: j.data.video_url, setup_status: 'tested', updated_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', auth.user.id);
  }
  return NextResponse.json({ ok: true, status: j.data?.status, video_url: j.data?.video_url, thumb_url: j.data?.thumbnail_url, correlation_id: correlationId });
}
