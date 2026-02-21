/**
 * GET  /api/creator-style — List user's studied creators
 * POST /api/creator-style — Create a new creator to study
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// GET — list creators
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('style_creators')
    .select('id, handle, platform, display_name, niche, notes, videos_analyzed, fingerprint_version, is_active, created_at, updated_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ creators: data });
}

// ---------------------------------------------------------------------------
// POST — create creator
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: { handle?: string; platform?: string; display_name?: string; niche?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { handle, platform, display_name, niche, notes } = body;

  if (!handle || typeof handle !== 'string') {
    return NextResponse.json({ error: 'handle is required (e.g. "@creator")' }, { status: 400 });
  }

  const normalizedPlatform = (platform || 'tiktok').toLowerCase();
  if (!['tiktok', 'youtube'].includes(normalizedPlatform)) {
    return NextResponse.json({ error: 'platform must be "tiktok" or "youtube"' }, { status: 400 });
  }

  // Normalize handle — strip leading @
  const normalizedHandle = handle.startsWith('@') ? handle.slice(1) : handle;

  const { data, error } = await supabaseAdmin
    .from('style_creators')
    .insert({
      user_id: auth.user.id,
      handle: normalizedHandle,
      platform: normalizedPlatform,
      display_name: display_name || null,
      niche: niche || null,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `Creator @${normalizedHandle} on ${normalizedPlatform} already exists` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ creator: data }, { status: 201 });
}
