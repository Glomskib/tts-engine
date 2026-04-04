/**
 * GET /api/visual-hooks/saved — list saved visual hook ideas for the current user
 * POST /api/visual-hooks/saved — save a visual hook idea
 * DELETE /api/visual-hooks/saved — unsave a visual hook idea by id
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('saved_visual_hooks')
    .select('*')
    .eq('user_id', user.id)
    .order('saved_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const body = await request.json();
  const { topic, action, shot_type, setup, pairs_with, energy, why_it_works } = body;

  if (!action || !topic) {
    return NextResponse.json({ error: 'action and topic required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('saved_visual_hooks')
    .insert({
      user_id: user.id,
      topic,
      action,
      shot_type: shot_type || 'close-up',
      setup: setup || '',
      pairs_with: pairs_with || null,
      energy: energy || 'punchy',
      why_it_works: why_it_works || null,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('saved_visual_hooks')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
