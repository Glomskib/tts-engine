/**
 * /api/create/brand-profiles — CRUD for brand voice profiles.
 *
 * GET    — list this user's profiles (all states, newest first)
 * POST   — create a new profile
 * PATCH  ?id=... — update
 * DELETE ?id=... — soft-delete (active=false)
 *
 * Each profile shapes hook ranking, caption rewriting, and color/font choice
 * for the user's renders. The hook ranker reads sample_posts_json + tone +
 * prohibited/preferred phrases to score clips through THIS voice.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('brand_profiles')
    .select('id, name, tone_descriptor, sample_posts_json, style_notes, prohibited_phrases, preferred_phrases, brand_color, brand_font, active, created_at, updated_at')
    .eq('user_id', auth.user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    // Table missing or other DB error — soft-fail so the UI still works.
    console.warn('[brand-profiles] read error:', error.message);
    return NextResponse.json({ ok: true, profiles: [] });
  }

  return NextResponse.json({ ok: true, profiles: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 }); }

  const name = String(body.name || '').trim().slice(0, 200);
  if (!name) return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('brand_profiles')
    .insert({
      user_id: auth.user.id,
      name,
      tone_descriptor: body.tone_descriptor ? String(body.tone_descriptor) : null,
      sample_posts_json: body.sample_posts ? JSON.stringify(body.sample_posts) : '[]',
      style_notes: body.style_notes ? String(body.style_notes) : null,
      prohibited_phrases: body.prohibited_phrases ? String(body.prohibited_phrases) : null,
      preferred_phrases: body.preferred_phrases ? String(body.preferred_phrases) : null,
      brand_color: body.brand_color ? String(body.brand_color) : null,
      brand_font: body.brand_font ? String(body.brand_font) : null,
      active: body.active === false ? false : true,
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 }); }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('name' in body) updates.name = String(body.name).slice(0, 200);
  if ('tone_descriptor' in body) updates.tone_descriptor = body.tone_descriptor || null;
  if ('sample_posts' in body) updates.sample_posts_json = JSON.stringify(body.sample_posts || []);
  if ('style_notes' in body) updates.style_notes = body.style_notes || null;
  if ('prohibited_phrases' in body) updates.prohibited_phrases = body.prohibited_phrases || null;
  if ('preferred_phrases' in body) updates.preferred_phrases = body.preferred_phrases || null;
  if ('brand_color' in body) updates.brand_color = body.brand_color || null;
  if ('brand_font' in body) updates.brand_font = body.brand_font || null;
  if ('active' in body) updates.active = !!body.active;

  // Auth: only update profiles owned by this user (service-role bypasses RLS, so we filter manually)
  const { error } = await supabaseAdmin
    .from('brand_profiles')
    .update(updates)
    .eq('id', id)
    .eq('user_id', auth.user.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 });

  // Soft delete: set active=false
  const { error } = await supabaseAdmin
    .from('brand_profiles')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', auth.user.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
