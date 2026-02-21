/**
 * GET    /api/creator-style/:creatorId — Get creator + their videos
 * PATCH  /api/creator-style/:creatorId — Update notes/niche
 * DELETE /api/creator-style/:creatorId — Remove creator + cascade videos
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ creatorId: string }>;
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(request: Request, context: RouteContext) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { creatorId } = await context.params;

  const { data: creator, error: creatorErr } = await supabaseAdmin
    .from('style_creators')
    .select('*')
    .eq('id', creatorId)
    .eq('user_id', auth.user.id)
    .single();

  if (creatorErr || !creator) {
    return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
  }

  const { data: videos, error: videosErr } = await supabaseAdmin
    .from('style_creator_videos')
    .select('id, url, platform, title, status, duration_seconds, error_message, processing_time_ms, created_at, analyzed_at')
    .eq('creator_id', creatorId)
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false });

  if (videosErr) {
    return NextResponse.json({ error: videosErr.message }, { status: 500 });
  }

  return NextResponse.json({ creator, videos: videos || [] });
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { creatorId } = await context.params;

  let body: { niche?: string; notes?: string; display_name?: string; is_active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.niche !== undefined) updates.niche = body.niche;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.display_name !== undefined) updates.display_name = body.display_name;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const { data, error } = await supabaseAdmin
    .from('style_creators')
    .update(updates)
    .eq('id', creatorId)
    .eq('user_id', auth.user.id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Creator not found or update failed' }, { status: 404 });
  }

  return NextResponse.json({ creator: data });
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { creatorId } = await context.params;

  // Videos cascade-delete via FK
  const { error } = await supabaseAdmin
    .from('style_creators')
    .delete()
    .eq('id', creatorId)
    .eq('user_id', auth.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
