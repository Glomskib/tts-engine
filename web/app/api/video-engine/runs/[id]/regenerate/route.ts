/**
 * POST /api/video-engine/runs/[id]/regenerate
 *
 * Creates a NEW run that reuses the same source asset. Used to:
 *   - try a different mode (affiliate ↔ nonprofit) for side-by-side compare
 *   - re-roll with different preset_keys / target_clip_count / context
 *
 * Body (all optional — defaults inherit from the source run):
 *   { mode?, preset_keys?, target_clip_count?, context? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { isMode, getMode } from '@/lib/video-engine/modes';
import { resolveRenderTemplateKeys } from '@/lib/video-engine/templates';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const { id: srcRunId } = await ctx.params;

  let body: { mode?: string; preset_keys?: string[]; target_clip_count?: number; context?: Record<string, unknown> };
  try { body = await request.json(); }
  catch { body = {}; }

  const { data: srcRun, error: srcErr } = await supabaseAdmin
    .from('ve_runs')
    .select('id,user_id,mode,preset_keys,target_clip_count,context_json')
    .eq('id', srcRunId)
    .single();
  if (srcErr || !srcRun) return createApiErrorResponse('NOT_FOUND', 'Source run not found', 404, correlationId);
  if (srcRun.user_id !== auth.user.id && !auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Run belongs to another user', 403, correlationId);
  }

  const { data: srcAsset } = await supabaseAdmin
    .from('ve_assets')
    .select('storage_bucket,storage_path,storage_url,original_filename,mime_type,byte_size,duration_sec,width,height')
    .eq('run_id', srcRunId)
    .limit(1)
    .single();
  if (!srcAsset) return createApiErrorResponse('NOT_FOUND', 'Source run has no asset', 404, correlationId);

  const mode = body.mode ?? srcRun.mode;
  if (!isMode(mode)) return createApiErrorResponse('BAD_REQUEST', 'Invalid mode', 400, correlationId);

  const target = Math.min(8, Math.max(1, body.target_clip_count ?? srcRun.target_clip_count));
  const modeCfg = getMode(mode);
  // If user changed mode, ignore the old run's preset_keys (they belong to a different template namespace).
  const presetSource = body.preset_keys ?? (mode === srcRun.mode ? srcRun.preset_keys : null);
  const resolvedPresets = resolveRenderTemplateKeys(mode, presetSource, target, modeCfg.defaultTemplateKeys);

  const { data: newRun, error: newErr } = await supabaseAdmin
    .from('ve_runs')
    .insert({
      user_id: auth.user.id,
      mode,
      preset_keys: resolvedPresets,
      target_clip_count: target,
      context_json: { ...(srcRun.context_json ?? {}), ...(body.context ?? {}), regenerated_from: srcRunId },
      status: 'created',
    })
    .select('id')
    .single();
  if (newErr || !newRun) return createApiErrorResponse('DB_ERROR', `Failed to create run: ${newErr?.message}`, 500, correlationId);

  const { error: assetErr } = await supabaseAdmin.from('ve_assets').insert({
    run_id: newRun.id,
    user_id: auth.user.id,
    storage_bucket: srcAsset.storage_bucket,
    storage_path: srcAsset.storage_path,
    storage_url: srcAsset.storage_url,
    original_filename: srcAsset.original_filename,
    mime_type: srcAsset.mime_type,
    byte_size: srcAsset.byte_size,
    duration_sec: srcAsset.duration_sec,
    width: srcAsset.width,
    height: srcAsset.height,
  });
  if (assetErr) {
    await supabaseAdmin.from('ve_runs').delete().eq('id', newRun.id);
    return createApiErrorResponse('DB_ERROR', `Failed to copy asset: ${assetErr.message}`, 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: { run_id: newRun.id, source_run_id: srcRunId, mode, preset_keys: resolvedPresets },
    correlation_id: correlationId,
  });
}
