/**
 * POST /api/editor/jobs/[id]/start — enqueue the edit pipeline via Inngest.
 *
 * This handler no longer runs the pipeline inline. It validates ownership +
 * daily limit, flips the job to `queued`, then sends `editor/job.process`
 * to Inngest and returns immediately. The client polls the job row for
 * status updates.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { checkDailyLimit, incrementUsage } from '@/lib/usage/dailyUsage';
import { inngest } from '@/lib/inngest/client';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const { data: job, error: jobErr } = await supabaseAdmin
    .from('edit_jobs')
    .select('id,user_id,assets,status')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .single();
  if (jobErr || !job) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (process.env.NODE_ENV !== 'production' || process.env.EDITOR_DEBUG === '1') {
    console.log('[editor]', { route: 'start', user_id: auth.user.id, job_id: id });
  }

  // Enforce both the legacy `renders` cap and the new `edits` cap — whichever
  // trips first. `edits` is the Phase 3 monetization kind sourced from PLANS.
  const [renderLimit, editLimit] = await Promise.all([
    checkDailyLimit(auth.user.id, auth.isAdmin, 'renders'),
    checkDailyLimit(auth.user.id, auth.isAdmin, 'edits'),
  ]);
  const blocked = !renderLimit.allowed ? renderLimit : !editLimit.allowed ? editLimit : null;
  if (blocked) {
    return NextResponse.json(
      {
        error: 'LIMIT_REACHED',
        upgrade: true,
        feature: 'edits',
        headline: "You've hit your daily limit. Upgrade to keep creating.",
        subtext: `You used ${blocked.used} of ${blocked.limit} edits today. Unlock more on Creator ($29/mo).`,
        limit: blocked.limit,
        used: blocked.used,
      },
      { status: 429 },
    );
  }

  // Defense-in-depth: refuse to start a job that has no raw footage attached.
  // This mirrors the check in from-pipeline / upload and guarantees the Inngest
  // pipeline never runs on an empty draft, no matter which flow created the job.
  const assets = Array.isArray(job.assets) ? job.assets : [];
  const rawCount = assets.filter((a: { kind?: string }) => a.kind === 'raw').length;
  if (rawCount === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'No raw footage attached to this job. Upload a video before starting.',
      },
      { status: 400 },
    );
  }

  if (['queued', 'transcribing', 'building_timeline', 'rendering'].includes(job.status)) {
    return NextResponse.json({ error: 'ALREADY_RUNNING' }, { status: 409 });
  }

  await supabaseAdmin
    .from('edit_jobs')
    .update({ status: 'queued', error: null, started_at: null, finished_at: null })
    .eq('id', id);

  await inngest.send({
    name: 'editor/job.process',
    data: { jobId: id, userId: auth.user.id },
  });

  // Count this as both a render (legacy) and an edit (Phase 3).
  await Promise.all([
    incrementUsage(auth.user.id, 'renders').catch(() => {}),
    incrementUsage(auth.user.id, 'edits').catch(() => {}),
  ]);

  return NextResponse.json({ ok: true, queued: true });
}
