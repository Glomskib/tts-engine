/**
 * Cron: Clip Discover — Every 6 hours
 *
 * Searches YouTube for supplement-related clips using ingredient queries
 * from the Obsidian skill rules. Stores candidate metadata only (no downloads).
 * Logged to ff_cron_runs for heartbeat monitoring.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { runDiscovery } from '@/lib/clip-index/discovery';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requestId = request.headers.get('x-vercel-id') || crypto.randomUUID();
  const { data: cronRun } = await supabaseAdmin
    .from('ff_cron_runs')
    .insert({
      job: 'clip-discover',
      status: 'running',
      http_method: request.method,
      request_id: requestId,
    })
    .select('id')
    .single();

  const runId = cronRun?.id;

  try {
    const result = await runDiscovery();

    console.log(
      `[cron/clip-discover] found=${result.found} inserted=${result.inserted} deduped=${result.deduped} queries=${result.queries_run} errors=${result.errors.length}`,
    );

    if (runId) {
      await supabaseAdmin
        .from('ff_cron_runs')
        .update({
          status: result.errors.length > 0 ? 'error' : 'ok',
          finished_at: new Date().toISOString(),
          error: result.errors.length > 0 ? result.errors.join('; ').slice(0, 1000) : null,
          meta: {
            found: result.found,
            inserted: result.inserted,
            deduped: result.deduped,
            queries_run: result.queries_run,
            errors: result.errors.length,
          },
        })
        .eq('id', runId);
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/clip-discover] Fatal:', err);

    if (runId) {
      await supabaseAdmin
        .from('ff_cron_runs')
        .update({
          status: 'error',
          finished_at: new Date().toISOString(),
          error: String(err).slice(0, 1000),
        })
        .eq('id', runId);
    }

    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
