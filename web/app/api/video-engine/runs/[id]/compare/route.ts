/**
 * GET /api/video-engine/runs/[id]/compare
 *
 * Returns this run plus all sibling runs that came from the same source asset
 * (i.e. the regenerate chain). Used to power the side-by-side comparison view.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const { id: runId } = await ctx.params;

  const { data: srcRun } = await supabaseAdmin
    .from('ve_runs')
    .select('id,user_id')
    .eq('id', runId)
    .single();
  if (!srcRun) return createApiErrorResponse('NOT_FOUND', 'Run not found', 404, correlationId);
  if (srcRun.user_id !== auth.user.id && !auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Run belongs to another user', 403, correlationId);
  }

  const { data: srcAsset } = await supabaseAdmin
    .from('ve_assets')
    .select('storage_path')
    .eq('run_id', runId)
    .limit(1)
    .single();
  if (!srcAsset) return NextResponse.json({ ok: true, data: { source_path: null, runs: [] }, correlation_id: correlationId });

  // Find all assets pointing at the same storage_path for this user — that's the sibling set.
  const { data: assets } = await supabaseAdmin
    .from('ve_assets')
    .select('run_id')
    .eq('user_id', srcRun.user_id)
    .eq('storage_path', srcAsset.storage_path);
  const runIds = Array.from(new Set((assets ?? []).map((a) => a.run_id)));
  if (runIds.length === 0) return NextResponse.json({ ok: true, data: { source_path: srcAsset.storage_path, runs: [] }, correlation_id: correlationId });

  const { data: runs } = await supabaseAdmin
    .from('ve_runs')
    .select('id,mode,status,preset_keys,target_clip_count,created_at,completed_at,error_message')
    .in('id', runIds)
    .order('created_at', { ascending: true });

  // Attach a tiny summary of rendered clip URLs for each run.
  const { data: rendered } = await supabaseAdmin
    .from('ve_rendered_clips')
    .select('run_id,id,template_key,cta_key,mode,status,output_url,thumbnail_url,duration_sec')
    .in('run_id', runIds);

  const renderedByRun = new Map<string, typeof rendered>();
  for (const r of rendered ?? []) {
    const arr = renderedByRun.get(r.run_id) ?? [];
    arr.push(r);
    renderedByRun.set(r.run_id, arr);
  }

  const enriched = (runs ?? []).map((r) => ({ ...r, rendered: renderedByRun.get(r.id) ?? [] }));

  return NextResponse.json({
    ok: true,
    data: { source_path: srcAsset.storage_path, runs: enriched },
    correlation_id: correlationId,
  });
}
