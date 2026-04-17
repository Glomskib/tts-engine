/**
 * GET /api/video-engine/runs/[id]
 *
 * Returns full run state: run, asset, transcript summary, clip candidates,
 * and rendered clips (with output URLs). Powers the processing/results UI.
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

  const { data: run, error: runErr } = await supabaseAdmin
    .from('ve_runs')
    .select('id,user_id,mode,preset_keys,status,target_clip_count,context_json,error_message,attempts,created_at,updated_at,completed_at,detected_intent,plan_id_at_run,watermark,notify_state')
    .eq('id', runId)
    .single();
  if (runErr || !run) return createApiErrorResponse('NOT_FOUND', 'Run not found', 404, correlationId);
  if (run.user_id !== auth.user.id && !auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Run belongs to another user', 403, correlationId);
  }

  const [assetQ, transcriptQ, candQ, renderedQ] = await Promise.all([
    supabaseAdmin.from('ve_assets').select('id,storage_path,storage_url,original_filename,duration_sec,mime_type,byte_size').eq('run_id', runId).limit(1).maybeSingle(),
    supabaseAdmin.from('ve_transcripts').select('id,language,full_text,duration_sec,source,created_at').eq('run_id', runId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('ve_clip_candidates').select('id,start_sec,end_sec,text,hook_text,clip_type,score,score_breakdown_json,selected,rank,hook_strength,suggested_use,selection_reason,best_for').eq('run_id', runId).order('rank', { ascending: true, nullsFirst: false }),
    supabaseAdmin.from('ve_rendered_clips').select('id,candidate_id,template_key,cta_key,mode,status,output_url,thumbnail_url,duration_sec,error_message,created_at,completed_at,caption_text,hashtags,suggested_title,cta_suggestion,watermark,package_status,regen_count,variant_of_id').eq('run_id', runId).order('created_at', { ascending: true }),
  ]);

  return NextResponse.json({
    ok: true,
    data: {
      run,
      asset: assetQ.data ?? null,
      transcript: transcriptQ.data ?? null,
      candidates: candQ.data ?? [],
      rendered: renderedQ.data ?? [],
    },
    correlation_id: correlationId,
  });
}
