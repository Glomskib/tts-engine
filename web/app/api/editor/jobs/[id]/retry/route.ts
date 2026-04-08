/**
 * POST /api/editor/jobs/[id]/retry — reset error and re-run pipeline.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { processEditJob } from '@/lib/editor/pipeline';
import { incrementUsage } from '@/lib/usage/dailyUsage';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const { data: job, error: jobErr } = await supabaseAdmin
    .from('edit_jobs')
    .select('id,user_id')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .single();
  if (jobErr || !job) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

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
    await supabaseAdmin
      .from('edit_jobs')
      .update({ status: 'failed', error: msg })
      .eq('id', id);
    return NextResponse.json({ error: 'PIPELINE_FAILED', message: msg }, { status: 500 });
  }
}
