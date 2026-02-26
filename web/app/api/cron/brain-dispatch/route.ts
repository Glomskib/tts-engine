/**
 * Cron: Brain Dispatch — Every 2 minutes
 *
 * Scans decisions (local vault OR GitHub repo) for approved decisions
 * without mc_status, creates project_tasks in Supabase, writes back mc_task_id.
 *
 * Source priority: local vault > GitHub > skip
 */
import { NextResponse } from 'next/server';
import {
  runBrainDispatch,
  resolveSource,
} from '@/Automation/brain_dispatcher';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const source = await resolveSource();
  if (!source) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'No source available (no vault, no GitHub token)',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const result = await runBrainDispatch();
    console.log(
      `[cron/brain-dispatch] source=${result.source} dispatched=${result.dispatched.length} skipped=${result.skipped.length} errors=${result.errors.length}`,
    );
    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[cron/brain-dispatch] Fatal:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
