/**
 * GET /api/remix/session?id={uuid}
 *
 * Returns a single remix session by ID. Public — no auth required.
 * Only returns sessions with a workspace_id (logged-in user created it).
 */

import { NextResponse } from 'next/server';
import { generateCorrelationId } from '@/lib/api-errors';
import { logEventSafe } from '@/lib/events-log';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Valid remix session ID required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('remix_sessions')
    .select('id, source_url, platform, original_hook, remix_script, hooks, visual_hooks, context, created_at')
    .eq('id', id)
    .not('workspace_id', 'is', null)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Remix not found' }, { status: 404 });
  }

  // Log remix_viewed event (non-fatal, fire-and-forget)
  logEventSafe(supabaseAdmin, {
    entity_type: 'remix',
    entity_id: id,
    event_type: 'remix_viewed',
    payload: { platform: data.platform },
  });

  return NextResponse.json({
    ok: true,
    data,
    correlation_id: correlationId,
  });
}
