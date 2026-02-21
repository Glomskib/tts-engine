/**
 * GET /api/creator-style/:creatorId/export
 *
 * Return the full StylePack JSON for a creator.
 * Rebuilds from video analyses if the cached version is stale.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { buildStylePack } from '@/lib/creator-style/style-pack';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ creatorId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { creatorId } = await context.params;

  // Verify ownership
  const { data: creator, error: creatorErr } = await supabaseAdmin
    .from('style_creators')
    .select('id, handle, platform, style_fingerprint, fingerprint_version, videos_analyzed, user_id')
    .eq('id', creatorId)
    .eq('user_id', auth.user.id)
    .single();

  if (creatorErr || !creator) {
    return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
  }

  // Check if rebuild is needed — compare videos_analyzed in fingerprint vs actual count
  const { count } = await supabaseAdmin
    .from('style_creator_videos')
    .select('id', { count: 'exact', head: true })
    .eq('creator_id', creatorId)
    .eq('status', 'completed');

  const actualCompleted = count || 0;
  const cachedCount = (creator.style_fingerprint as Record<string, unknown>)?.videos_analyzed as number || 0;

  // Use cached if up to date, otherwise rebuild
  const force = new URL(request.url).searchParams.get('force') === 'true';

  if (creator.style_fingerprint && cachedCount === actualCompleted && !force) {
    return NextResponse.json({
      style_pack: creator.style_fingerprint,
      cached: true,
      fingerprint_version: creator.fingerprint_version,
    });
  }

  if (actualCompleted === 0) {
    return NextResponse.json(
      { error: 'No completed video analyses yet. Ingest some URLs first.' },
      { status: 404 },
    );
  }

  // Rebuild
  try {
    const stylePack = await buildStylePack(creatorId);
    return NextResponse.json({
      style_pack: stylePack,
      cached: false,
      fingerprint_version: creator.fingerprint_version + 1,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to build StylePack: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
