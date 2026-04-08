/**
 * POST /api/editor/jobs/[id]/retry — re-enqueue a failed edit job via Inngest.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
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
    .from('ai_edit_jobs')
    .select('id,user_id')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .single();
  if (jobErr || !job) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (process.env.NODE_ENV !== 'production' || process.env.EDITOR_DEBUG === '1') {
    console.log('[editor]', { route: 'retry', user_id: auth.user.id, job_id: id });
  }

  await supabaseAdmin
    .from('ai_edit_jobs')
    .update({ status: 'queued', error: null, started_at: null, finished_at: null })
    .eq('id', id)
    .eq('user_id', auth.user.id);

  await inngest.send({
    name: 'editor/job.process',
    data: { jobId: id, userId: auth.user.id },
  });

  return NextResponse.json({ ok: true, queued: true });
}
