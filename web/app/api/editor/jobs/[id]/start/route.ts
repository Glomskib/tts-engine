/**
 * POST /api/editor/jobs/[id]/start — flip to transcribing and run the pipeline.
 * Runs synchronously inside this request (Vercel maxDuration = 300s).
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { processEditJob } from '@/lib/editor/pipeline';
import { checkDailyLimit, incrementUsage } from '@/lib/usage/dailyUsage';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  // Verify ownership
  const { data: job, error: jobErr } = await supabaseAdmin
    .from('edit_jobs')
    .select('id,user_id,assets,status')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .single();
  if (jobErr || !job) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Daily limit
  const limit = await checkDailyLimit(auth.user.id, auth.isAdmin, 'renders');
  if (!limit.allowed) {
    return NextResponse.json({ error: 'LIMIT_REACHED', upgrade: true, limit: limit.limit, used: limit.used }, { status: 429 });
  }

  const assets = Array.isArray(job.assets) ? job.assets : [];
  const hasRaw = assets.some((a: { kind?: string }) => a.kind === 'raw');
  if (!hasRaw) {
    return NextResponse.json({ error: 'NO_RAW_FOOTAGE' }, { status: 400 });
  }

  if (['transcribing', 'building_timeline', 'rendering'].includes(job.status)) {
    return NextResponse.json({ error: 'ALREADY_RUNNING' }, { status: 409 });
  }

  await supabaseAdmin
    .from('edit_jobs')
    .update({ status: 'transcribing', error: null })
    .eq('id', id);

  try {
    await processEditJob(id);
    await incrementUsage(auth.user.id, 'renders').catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[editor] pipeline failed', id, msg);
    await supabaseAdmin
      .from('edit_jobs')
      .update({ status: 'failed', error: msg })
      .eq('id', id);
    return NextResponse.json({ error: 'PIPELINE_FAILED', message: msg }, { status: 500 });
  }
}
