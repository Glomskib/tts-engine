/**
 * POST /api/edit-builder/projects/[id]/plans — generate a new EditPlan version.
 *
 * Phase 1: returns a stub plan built via `buildStubEditPlan()` from the
 * project's source clips. Real analysis-driven plans land in Phase 3.
 *
 * PATCH /api/edit-builder/projects/[id]/plans — save a user-edited plan as
 * a new version (validated via Zod).
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { EditPlanSchema, buildEditPlanFromClips } from '@/lib/edit-builder/types';

export const runtime = 'nodejs';

async function nextVersion(projectId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('edit_plans')
    .select('version')
    .eq('edit_project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.version ?? 0) + 1;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await context.params;

  // Ownership check
  const { data: project, error: pErr } = await supabaseAdmin
    .from('edit_projects')
    .select('id,user_id')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .single();
  if (pErr || !project) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const { data: clips } = await supabaseAdmin
    .from('edit_source_clips')
    .select('id,duration_ms')
    .eq('edit_project_id', id)
    .eq('user_id', auth.user.id)
    .order('sort_order', { ascending: true });

  if (!clips || clips.length === 0) {
    return NextResponse.json({ error: 'NO_CLIPS', message: 'Upload at least one clip before generating a plan.' }, { status: 400 });
  }

  const plan = buildEditPlanFromClips(id, clips);
  const parsed = EditPlanSchema.safeParse(plan);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'PLAN_VALIDATION_FAILED', details: parsed.error.issues },
      { status: 500 },
    );
  }

  const version = await nextVersion(id);

  const { data: row, error } = await supabaseAdmin
    .from('edit_plans')
    .insert({
      edit_project_id: id,
      user_id: auth.user.id,
      version,
      plan_json: parsed.data,
      created_by_system: true,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ plan: row });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await context.params;

  let raw: unknown = {};
  try { raw = await request.json(); } catch {}
  const parsed = EditPlanSchema.safeParse((raw as { plan?: unknown })?.plan ?? raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_PLAN', details: parsed.error.issues }, { status: 400 });
  }
  if (parsed.data.projectId !== id) {
    return NextResponse.json({ error: 'PROJECT_ID_MISMATCH' }, { status: 400 });
  }

  // Ownership check
  const { data: project } = await supabaseAdmin
    .from('edit_projects')
    .select('id')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .single();
  if (!project) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const version = await nextVersion(id);

  const { data: row, error } = await supabaseAdmin
    .from('edit_plans')
    .insert({
      edit_project_id: id,
      user_id: auth.user.id,
      version,
      plan_json: parsed.data,
      created_by_system: false,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ plan: row });
}
