import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isValidMode } from '@/lib/v1/clip-generation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('v1_clip_sets')
    .select('id, title, input_mode, input_value, niche, tone, clips, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[clips/sets GET]', error);
    return NextResponse.json({ error: 'fetch_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sets: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 120) : 'Untitled clip set';
  const mode = body.mode;
  const value = typeof body.value === 'string' ? body.value.trim() : '';
  const niche = typeof body.niche === 'string' ? body.niche.trim() : null;
  const tone = typeof body.tone === 'string' ? body.tone : null;
  const clips = Array.isArray(body.clips) ? body.clips : null;

  if (!isValidMode(mode)) return NextResponse.json({ error: 'invalid_mode' }, { status: 400 });
  if (!value) return NextResponse.json({ error: 'missing_value' }, { status: 400 });
  if (!clips || clips.length === 0) return NextResponse.json({ error: 'missing_clips' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('v1_clip_sets')
    .insert({
      user_id: user.id,
      title,
      input_mode: mode,
      input_value: value,
      niche,
      tone,
      clips,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[clips/sets POST]', error);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
