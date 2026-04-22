/**
 * GET /api/edit-builder/projects/[id] — fetch a single project with
 * its source clips and latest plan (if any).
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await context.params;

  const { data: project, error: pErr } = await supabaseAdmin
    .from('edit_projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .single();

  if (pErr || !project) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const [clipsRes, latestPlanRes, rendersRes] = await Promise.all([
    supabaseAdmin
      .from('edit_source_clips')
      .select('*')
      .eq('edit_project_id', id)
      .eq('user_id', auth.user.id)
      .order('sort_order', { ascending: true }),
    supabaseAdmin
      .from('edit_plans')
      .select('*')
      .eq('edit_project_id', id)
      .eq('user_id', auth.user.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('render_jobs')
      .select('id,status,render_kind,progress,output_url,preview_url,error_message,created_at,updated_at')
      .eq('edit_project_id', id)
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  return NextResponse.json({
    project,
    clips: clipsRes.data ?? [],
    latest_plan: latestPlanRes.data ?? null,
    renders: rendersRes.data ?? [],
  });
}
