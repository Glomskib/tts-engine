/**
 * Mission Control — Operator Feed
 *
 * Bolt (and any MC-authed agent) pushes items here that should land on the
 * owner's "On your plate" zone. Owner also dismisses/acts via this endpoint.
 *
 * Auth:
 *   POST: MC service token (MISSION_CONTROL_TOKEN) OR owner session
 *   GET:  owner session (reads from command-center landing)
 *   PATCH: owner session (dismiss / mark acted)
 *
 * POST body (minimum):
 *   { kind: 'email'|'calendar'|'approval'|'flag'|'fyi',
 *     title: string,
 *     one_line?: string,
 *     urgency?: 'low'|'normal'|'high'|'urgent',
 *     action_url?: string,
 *     action_label?: string,
 *     lane?: string,
 *     source_agent?: string,
 *     expires_at?: ISO timestamp,
 *     metadata?: object }
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireOwner } from '@/lib/command-center/owner-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_KINDS = ['email', 'calendar', 'approval', 'flag', 'fyi'] as const;
const VALID_URGENCY = ['low', 'normal', 'high', 'urgent'] as const;

function authedByMcToken(request: NextRequest): boolean {
  const serviceToken = process.env.MISSION_CONTROL_TOKEN;
  if (!serviceToken) return false;
  const authHeader = request.headers.get('authorization');
  const alt = request.headers.get('x-service-token') || request.headers.get('x-mc-token');
  return authHeader === `Bearer ${serviceToken}` || alt === serviceToken;
}

export async function POST(request: NextRequest) {
  const mcAuthed = authedByMcToken(request);
  if (!mcAuthed) {
    const blocked = await requireOwner(request);
    if (blocked) return blocked;
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const kind = String(body.kind || '');
  if (!VALID_KINDS.includes(kind as typeof VALID_KINDS[number])) {
    return NextResponse.json(
      { error: `kind must be one of ${VALID_KINDS.join(', ')}` },
      { status: 400 }
    );
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title || title.length > 200) {
    return NextResponse.json(
      { error: 'title is required (1-200 chars)' },
      { status: 400 }
    );
  }

  const urgency = VALID_URGENCY.includes(body.urgency as typeof VALID_URGENCY[number])
    ? (body.urgency as string)
    : 'normal';

  const row = {
    kind,
    urgency,
    title,
    one_line: typeof body.one_line === 'string' ? body.one_line.slice(0, 400) : null,
    action_url: typeof body.action_url === 'string' ? body.action_url.slice(0, 1000) : null,
    action_label: typeof body.action_label === 'string' ? body.action_label.slice(0, 40) : null,
    lane: typeof body.lane === 'string' ? body.lane.slice(0, 80) : null,
    source_agent: typeof body.source_agent === 'string' ? body.source_agent.slice(0, 80) : null,
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    expires_at: typeof body.expires_at === 'string' ? body.expires_at : null,
  };

  const { data, error } = await supabaseAdmin
    .from('mc_operator_feed')
    .insert(row)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[mc-operator-feed] insert failed:', error.message);
    return NextResponse.json(
      { error: 'Insert failed', detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: data?.id });
}

export async function GET(request: NextRequest) {
  const blocked = await requireOwner(request);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '25'), 100);

  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('mc_operator_feed')
      .select('*')
      .is('dismissed_at', null)
      .is('acted_at', null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('urgency', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[mc-operator-feed] read failed, returning empty:', error.message);
      return NextResponse.json({ items: [], warning: 'Feed table not ready — run the migration' });
    }

    return NextResponse.json({ items: data || [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.warn('[mc-operator-feed] error:', msg);
    return NextResponse.json({ items: [], warning: msg });
  }
}

export async function PATCH(request: NextRequest) {
  const blocked = await requireOwner(request);
  if (blocked) return blocked;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : null;
  const action = body.action as 'dismiss' | 'acted';
  if (!id || !['dismiss', 'acted'].includes(action)) {
    return NextResponse.json({ error: 'id and action (dismiss|acted) required' }, { status: 400 });
  }

  const patch = action === 'dismiss'
    ? { dismissed_at: new Date().toISOString() }
    : { acted_at: new Date().toISOString() };

  const { error } = await supabaseAdmin
    .from('mc_operator_feed')
    .update(patch)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
