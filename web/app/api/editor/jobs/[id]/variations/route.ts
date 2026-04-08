/**
 * POST /api/editor/jobs/[id]/variations — create 1-3 variation jobs
 * that reuse the source job's assets (same storage paths, no copy)
 * but tweak mode / caption style / pace.
 *
 * Free tier: 1 variation/day. Paid: 3 per call, no daily cap.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { checkDailyLimit, incrementUsage, getUserPlan, isPaidPlan } from '@/lib/usage/dailyUsage';
import { inngest } from '@/lib/inngest/client';
import type { EditMode } from '@/lib/editor/pipeline';

export const runtime = 'nodejs';

function nextMode(mode: EditMode): EditMode {
  switch (mode) {
    case 'quick': return 'hook';
    case 'hook': return 'ugc';
    case 'ugc': return 'talking_head';
    case 'talking_head': return 'hook';
    default: return 'hook';
  }
}

interface VariationSpec {
  label: string;
  mode: EditMode;
  mode_options: Record<string, unknown>;
}

function buildVariationSpecs(sourceMode: EditMode, sourceOptions: Record<string, unknown>): VariationSpec[] {
  return [
    {
      label: 'Kinetic Captions',
      mode: sourceMode,
      mode_options: { ...sourceOptions, caption_style: 'kinetic' },
    },
    {
      label: `Mode: ${nextMode(sourceMode)}`,
      mode: nextMode(sourceMode),
      mode_options: { ...sourceOptions },
    },
    {
      label: 'Fast Pace',
      mode: sourceMode,
      mode_options: { ...sourceOptions, pace: 'fast' },
    },
  ];
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  // Load source job
  const { data: source, error: srcErr } = await supabaseAdmin
    .from('edit_jobs')
    .select('id,user_id,title,mode,mode_options,assets,script_id,status')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .single();
  if (srcErr || !source) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (source.status !== 'completed') {
    return NextResponse.json({ error: 'SOURCE_NOT_COMPLETED' }, { status: 409 });
  }

  // Daily limit enforcement
  const limit = await checkDailyLimit(auth.user.id, auth.isAdmin, 'variations');
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: 'LIMIT_REACHED',
        upgrade: true,
        feature: 'variations',
        headline: 'Variations are how creators scale.',
        subtext: 'Unlock unlimited variations on Creator ($29/mo).',
        limit: limit.limit,
        used: limit.used,
      },
      { status: 429 },
    );
  }

  const plan = await getUserPlan(auth.user.id);
  const paid = auth.isAdmin || isPaidPlan(plan);
  // Free tier: 1 variation. Paid: 3 variations per call.
  const count = paid ? 3 : 1;

  const sourceMode = source.mode as EditMode;
  const sourceOptions: Record<string, unknown> =
    source.mode_options && typeof source.mode_options === 'object'
      ? (source.mode_options as Record<string, unknown>)
      : {};
  const specs = buildVariationSpecs(sourceMode, sourceOptions).slice(0, count);
  const sourceAssets = Array.isArray(source.assets) ? source.assets : [];

  const createdIds: string[] = [];
  for (const spec of specs) {
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('edit_jobs')
      .insert({
        user_id: auth.user.id,
        title: `${source.title} — ${spec.label}`,
        mode: spec.mode,
        mode_options: spec.mode_options,
        assets: sourceAssets, // REUSE existing storage paths — no copy
        script_id: source.script_id,
        parent_job_id: source.id,
        status: 'queued',
      })
      .select('id')
      .single();

    if (insErr || !inserted) {
      return NextResponse.json(
        { error: 'INSERT_FAILED', detail: insErr?.message, created: createdIds },
        { status: 500 },
      );
    }

    createdIds.push(inserted.id);
    await inngest.send({
      name: 'editor/job.process',
      data: { jobId: inserted.id, userId: auth.user.id },
    });
    // Count each variation against the daily cap.
    await incrementUsage(auth.user.id, 'variations').catch(() => {});
  }

  return NextResponse.json({ ok: true, count: createdIds.length, jobIds: createdIds });
}
