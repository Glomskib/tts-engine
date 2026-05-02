/**
 * GET /api/editor/jobs/[id]/script-attempts
 *
 * Lists every script_attempts row for the given edit job, grouped by
 * script_group. Used by /admin/editor/[jobId]/scripts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: jobId } = await ctx.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Verify the job belongs to the user (or their org once MT is on).
  const { data: job } = await supabaseAdmin
    .from('ai_edit_jobs')
    .select('id, user_id')
    .eq('id', jobId)
    .maybeSingle();
  if (!job || job.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  }

  const { data: attempts, error } = await supabaseAdmin
    .from('script_attempts')
    .select('*')
    .eq('edit_job_id', jobId)
    .order('script_group', { ascending: true })
    .order('take_number', { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Group attempts by script_group for the UI
  const byGroup = new Map<string, typeof attempts>();
  for (const a of attempts || []) {
    const list = byGroup.get(a.script_group) || [];
    list.push(a);
    byGroup.set(a.script_group, list);
  }

  const groups = Array.from(byGroup.entries()).map(([group, takes]) => ({
    script_group: group,
    script_text: takes[0]?.script_text || '',
    takes,
  }));

  return NextResponse.json({ ok: true, groups });
}
