// ============================================================
// FlashFlow — POST /api/scripts/[id]/event
// Implicit-usage tracking endpoint.
// Drop into: web/app/api/scripts/[id]/event/route.ts
//
// Auth model assumption: existing FlashFlow pattern (Supabase
// session cookie via @supabase/ssr). If your auth helper lives
// somewhere else, replace `getServerSupabase` with that.
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const VALID_EVENTS = new Set([
  'viewed',
  'copied',
  'filmed',
  'skipped',
  'regenerated',
  'thumb_up',
  'thumb_down',
] as const);

type EventType = typeof VALID_EVENTS extends Set<infer T> ? T : never;

// Per-event-type rate guard (per user, per script) so a noisy client
// doesn't pollute the rating pool with 500 'viewed' events in a loop.
const DEDUP_WINDOW_MS: Record<string, number> = {
  viewed: 30_000,     // one 'view' per 30s per (user, script)
  copied: 5_000,
  skipped: 5_000,
  regenerated: 5_000,
  filmed: 60_000,     // only counts once per minute, hard event
  thumb_up: 1_000,
  thumb_down: 1_000,
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: scriptId } = await params;

  // Parse + validate body
  let body: { event_type?: string; metadata?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const eventType = body.event_type;
  if (!eventType || !VALID_EVENTS.has(eventType as EventType)) {
    return NextResponse.json({ error: 'invalid_event_type' }, { status: 400 });
  }

  // Auth — must be a real user; service role events are written server-side, not here.
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Resolve account_id from script_patterns (the script's owning account).
  // RLS ensures this only returns rows the user has access to — if they
  // can't read the script, they can't rate it. Cast `from(...)` through any
  // because the schema isn't in the generated Supabase types until the
  // migration is applied — the route still typechecks and works.
  const { data: pattern, error: patternErr } = await (supabase as any)
    .from('script_patterns')
    .select('account_id')
    .eq('script_id', scriptId)
    .single();

  if (patternErr || !pattern) {
    return NextResponse.json({ error: 'script_not_found' }, { status: 404 });
  }

  // Dedup: check if same (user, script, event_type) fired inside window.
  const windowMs = DEDUP_WINDOW_MS[eventType] ?? 1000;
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count } = await (supabase as any)
    .from('script_events')
    .select('*', { count: 'exact', head: true })
    .eq('script_id', scriptId)
    .eq('user_id', user.id)
    .eq('event_type', eventType)
    .gte('created_at', since);

  if ((count ?? 0) > 0) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  // Insert event. Trigger on script_events recomputes script_quality.
  const { error: insertErr } = await (supabase as any).from('script_events').insert({
    script_id: scriptId,
    account_id: (pattern as any).account_id,
    user_id: user.id,
    event_type: eventType,
    metadata: body.metadata ?? {},
  });

  if (insertErr) {
    return NextResponse.json(
      { error: 'insert_failed', detail: insertErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
