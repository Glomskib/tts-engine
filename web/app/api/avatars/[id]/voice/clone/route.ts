import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return createApiErrorResponse('CONFIG_ERROR', 'ELEVENLABS_API_KEY not configured — add it in Vercel env', 503, correlationId);

  let body: { sample_urls?: string[]; name?: string };
  try { body = await req.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  const samples = (body.sample_urls || []).filter(u => typeof u === 'string').slice(0, 25);
  if (samples.length === 0) return createApiErrorResponse('VALIDATION_ERROR', 'sample_urls required', 400, correlationId);

  const { data: avatar } = await supabaseAdmin
    .from('brand_profiles')
    .select('id, avatar_display_name, name')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!avatar) return createApiErrorResponse('NOT_FOUND', 'avatar not found', 404, correlationId);

  const voiceName = (body.name || avatar.avatar_display_name || avatar.name || 'avatar voice').slice(0, 80);

  const form = new FormData();
  form.append('name', voiceName);
  form.append('description', `FlashFlow avatar voice for ${voiceName}`);
  for (const url of samples) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const blob = await r.blob();
      form.append('files', blob, `sample.${(blob.type || 'audio/mpeg').split('/')[1] || 'mp3'}`);
    } catch {}
  }

  const r = await fetch('https://api.elevenlabs.io/v1/voices/add', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    return createApiErrorResponse('AI_ERROR', `ElevenLabs ${r.status}: ${txt.slice(0, 300)}`, 502, correlationId);
  }
  const j = await r.json() as { voice_id?: string };
  if (!j.voice_id) return createApiErrorResponse('AI_ERROR', 'ElevenLabs returned no voice_id', 502, correlationId);

  await supabaseAdmin
    .from('brand_profiles')
    .update({
      voice_provider: 'elevenlabs',
      voice_clone_id: j.voice_id,
      voice_sample_urls_json: samples,
      voice_settings: { stability: 0.65, similarity_boost: 0.85, style: 0.0, use_speaker_boost: true },
      setup_status: 'voice',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  return NextResponse.json({ ok: true, voice_id: j.voice_id, correlation_id: correlationId });
}
