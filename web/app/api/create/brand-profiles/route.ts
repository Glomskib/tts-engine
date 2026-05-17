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
    .select('id, name, tone_descriptor, sample_posts_json, style_notes, prohibited_phrases, preferred_phrases, brand_color, brand_font, active, created_at, updated_at').eq('is_avatar', false)
    .eq('user_id', auth.user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    // Table missing or other DB error — soft-fail so the UI still works.
    console.warn('[brand-profiles] read error:', error.message);
    return NextResponse.json({ ok: true, profiles: [] });
  }

  return NextResponse.json({ ok: true, profiles: data || [] });
}

// Production hard caps — keep brand_profiles row size bounded so a single
// user can't paste a gigabyte of "sample posts" and break the DB.
const MAX_TEXT = 4000;          // per single text field
const MAX_SAMPLE_POSTS = 10;    // max sample posts in the array
const MAX_SAMPLE_POST_LEN = 4000; // per sample post
const MAX_PROFILES_PER_USER = 25; // hard ceiling — beyond this is abuse

function cap(value: unknown, max = MAX_TEXT): string | null {
  if (value == null) return null;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

export async function POST(req: NextRequest) {
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 }); }

  const name = String(body.name || '').trim().slice(0, 200);
  if (!name) return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 });

  // Per-user profile ceiling — stops single users from abuse
  const { count } = await supabaseAdmin
    .from('brand_profiles')
    .select('id', { count: 'exact', head: true }).eq('is_avatar', false)
    .eq('user_id', auth.user.id);
  if ((count || 0) >= MAX_PROFILES_PER_USER) {
    return NextResponse.json({
      ok: false,
      error: `You have ${count} brand profiles — that's the max. Delete one before creating another.`,
    }, { status: 429 });
  }

  // Sanitize sample_posts: cap count + length per post
  const rawSamples = Array.isArray(body.sample_posts) ? body.sample_posts : [];
  const samples = rawSamples
    .slice(0, MAX_SAMPLE_POSTS)
    .map((s) => (typeof s === 'string' ? s.slice(0, MAX_SAMPLE_POST_LEN) : ''))
    .filter(Boolean);

  const { data, error } = await supabaseAdmin
    .from('brand_profiles')
    .insert({
      user_id: auth.user.id,
      name,
      tone_descriptor: cap(body.tone_descriptor),
      sample_posts_json: JSON.stringify(samples),
      style_notes: cap(body.style_notes),
      prohibited_phrases: cap(body.prohibited_phrases),
      preferred_phrases: cap(body.preferred_phrases),
      brand_color: cap(body.brand_color, 30),
      brand_font: cap(body.brand_font, 100),
      active: body.active === false ? false : true,
    })
    .select('id').eq('is_avatar', false)
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
  if ('tone_descriptor' in body) updates.tone_descriptor = cap(body.tone_descriptor);
  if ('sample_posts' in body) {
    const rawSamples = Array.isArray(body.sample_posts) ? body.sample_posts : [];
    const samples = rawSamples
      .slice(0, MAX_SAMPLE_POSTS)
      .map((s) => (typeof s === 'string' ? s.slice(0, MAX_SAMPLE_POST_LEN) : ''))
      .filter(Boolean);
    updates.sample_posts_json = JSON.stringify(samples);
  }
  if ('style_notes' in body) updates.style_notes = cap(body.style_notes);
  if ('prohibited_phrases' in body) updates.prohibited_phrases = cap(body.prohibited_phrases);
  if ('preferred_phrases' in body) updates.preferred_phrases = cap(body.preferred_phrases);
  if ('brand_color' in body) updates.brand_color = cap(body.brand_color, 30);
  if ('brand_font' in body) updates.brand_font = cap(body.brand_font, 100);
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
