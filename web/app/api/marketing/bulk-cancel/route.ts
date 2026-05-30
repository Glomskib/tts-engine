/**
 * POST /api/marketing/bulk-cancel
 *
 * Bulk-mark pending posts as status='cancelled'. For clearing stale queue
 * pileups so Brandon doesn't have to reject one-by-one.
 *
 * Auth: owner session OR Bearer MISSION_CONTROL_TOKEN.
 *
 * Body (one or more filters required — refuses to no-op cancel everything):
 *   {
 *     older_than_days?: number,     // posts created N+ days ago
 *     source?: string,              // exact source match (e.g. "hhh-daily-cron")
 *     source_contains?: string,     // substring match on source
 *     not_approved_only?: boolean,  // default true — skip already-approved rows
 *     dry_run?: boolean,            // default false — preview the impact
 *     reason?: string               // recorded on every cancelled row
 *   }
 *
 * Returns: { ok, dry_run, matched, cancelled, sample: [...first 5...] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireOwner } from '@/lib/command-center/owner-guard';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function requireAuth(request: NextRequest): Promise<NextResponse | null> {
  const serviceToken = process.env.MISSION_CONTROL_TOKEN;
  if (serviceToken) {
    const authHeader = request.headers.get('authorization');
    const serviceAuth =
      request.headers.get('x-service-token') || request.headers.get('x-mc-token');
    if (authHeader === `Bearer ${serviceToken}` || serviceAuth === serviceToken) {
      return null;
    }
  }
  return requireOwner(request);
}

interface BulkCancelBody {
  older_than_days?: number;
  source?: string;
  source_contains?: string;
  not_approved_only?: boolean;
  dry_run?: boolean;
  reason?: string;
}

export async function POST(request: NextRequest) {
  const denied = await requireAuth(request);
  if (denied) return denied;

  let body: BulkCancelBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  const olderThanDays = typeof body.older_than_days === 'number' ? body.older_than_days : undefined;
  const source = typeof body.source === 'string' ? body.source.trim() : undefined;
  const sourceContains = typeof body.source_contains === 'string' ? body.source_contains.trim() : undefined;
  const notApprovedOnly = body.not_approved_only !== false; // default true
  const dryRun = body.dry_run === true;
  const reason = (typeof body.reason === 'string' && body.reason.trim()) || 'bulk-cancel by brandon';

  // Require at least one narrowing filter — refuse to no-op cancel everything
  if (olderThanDays === undefined && !source && !sourceContains) {
    return NextResponse.json(
      {
        error: 'Refusing to cancel without a narrowing filter. Provide older_than_days OR source OR source_contains.',
      },
      { status: 400 },
    );
  }

  let query = supabaseAdmin
    .from('marketing_posts')
    .select('id, source, created_at, meta, content')
    .eq('status', 'pending')
    .limit(5000);

  if (source) query = query.eq('source', source);
  if (sourceContains) query = query.ilike('source', `%${sourceContains}%`);
  if (olderThanDays !== undefined) {
    const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();
    query = query.lt('created_at', cutoff);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let candidates = (data || []);
  if (notApprovedOnly) {
    candidates = candidates.filter((r) => {
      const m = (r.meta as Record<string, unknown> | null) || {};
      return m.approved !== true;
    });
  }

  const sample = candidates.slice(0, 5).map((r) => ({
    id: r.id,
    source: r.source,
    created_at: r.created_at,
    preview: typeof r.content === 'string' ? r.content.slice(0, 80) : '',
  }));

  if (dryRun || candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      matched: candidates.length,
      cancelled: 0,
      sample,
      note: dryRun ? 'Dry run — nothing changed. Re-send with dry_run:false to cancel.' : 'No rows matched filters.',
    });
  }

  const ids = candidates.map((r) => r.id);
  const now = new Date().toISOString();

  // Update in batches of 200 to avoid Postgres parameter limits
  let cancelled = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const { error: updErr } = await supabaseAdmin
      .from('marketing_posts')
      .update({
        status: 'cancelled',
        error: reason,
        updated_at: now,
      })
      .in('id', batch);
    if (updErr) {
      return NextResponse.json(
        { ok: false, error: `batch ${i}: ${updErr.message}`, cancelled_so_far: cancelled },
        { status: 500 },
      );
    }
    cancelled += batch.length;
  }

  return NextResponse.json({
    ok: true,
    dry_run: false,
    matched: candidates.length,
    cancelled,
    sample,
  });
}
