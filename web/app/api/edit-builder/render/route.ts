/**
 * POST /api/edit-builder/render — enqueue a render job for a project + plan.
 *
 * Body: { project_id: string, plan_id?: string, kind?: 'preview' | 'final' }
 *
 * If `plan_id` is omitted, the latest plan for the project is used.
 * Inserts a `render_jobs` row with status='queued'. The Mac mini worker
 * (services/edit-worker) will pick it up on its next poll.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { z } from 'zod';

export const runtime = 'nodejs';

const BodySchema = z.object({
  project_id: z.string().uuid(),
  plan_id: z.string().uuid().optional(),
  kind: z.enum(['preview', 'final']).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
});

export async function POST(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let raw: unknown = {};
  try { raw = await request.json(); } catch {}
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', details: parsed.error.issues }, { status: 400 });
  }

  // Ownership check: project must belong to caller.
  const { data: project } = await supabaseAdmin
    .from('edit_projects')
    .select('id,user_id')
    .eq('id', parsed.data.project_id)
    .eq('user_id', auth.user.id)
    .single();
  if (!project) return NextResponse.json({ error: 'PROJECT_NOT_FOUND' }, { status: 404 });

  // Resolve plan: explicit id, else latest.
  let planId = parsed.data.plan_id;
  if (!planId) {
    const { data: latest } = await supabaseAdmin
      .from('edit_plans')
      .select('id')
      .eq('edit_project_id', parsed.data.project_id)
      .eq('user_id', auth.user.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latest) return NextResponse.json({ error: 'NO_PLAN' }, { status: 400 });
    planId = latest.id;
  } else {
    // Verify the explicit plan belongs to the same user + project.
    const { data: plan } = await supabaseAdmin
      .from('edit_plans')
      .select('id')
      .eq('id', planId)
      .eq('edit_project_id', parsed.data.project_id)
      .eq('user_id', auth.user.id)
      .single();
    if (!plan) return NextResponse.json({ error: 'PLAN_NOT_FOUND' }, { status: 404 });
  }

  const { data: job, error } = await supabaseAdmin
    .from('render_jobs')
    .insert({
      user_id: auth.user.id,
      edit_project_id: parsed.data.project_id,
      edit_plan_id: planId,
      render_kind: parsed.data.kind ?? 'preview',
      priority: parsed.data.priority ?? 100,
      status: 'queued',
      worker_target: 'mac-mini',
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ render_job: job });
}
