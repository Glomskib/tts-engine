/**
 * GET   /api/video-engine/runs/[id]
 * PATCH /api/video-engine/runs/[id]
 *
 * GET returns full run state: run, asset, transcript summary, clip
 * candidates, and rendered clips. PATCH is used to attach or edit the
 * product/affiliate fields on an existing run.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

const ALLOWED_PLATFORMS = new Set([
  'tiktok_shop', 'amazon', 'shopify', 'etsy', 'shopmy', 'ltk', 'custom', 'other',
]);

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const { id: runId } = await ctx.params;

  const { data: run, error: runErr } = await supabaseAdmin
    .from('ve_runs')
    .select('id,user_id,mode,preset_keys,status,target_clip_count,context_json,error_message,attempts,created_at,updated_at,completed_at,detected_intent,plan_id_at_run,watermark,notify_state,product_name,product_url,product_platform,product_price_cents,coupon_code')
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
    supabaseAdmin.from('ve_rendered_clips').select('id,candidate_id,template_key,cta_key,mode,status,output_url,thumbnail_url,duration_sec,error_message,created_at,completed_at,caption_text,hashtags,suggested_title,cta_suggestion,hook_line,alt_captions,copies_made,watermark,package_status,regen_count,variant_of_id').eq('run_id', runId).order('created_at', { ascending: true }),
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

/**
 * PATCH — update product / affiliate fields on a run.
 *
 * Body (all fields optional; send `null` to clear an individual field):
 *   {
 *     product_name?:        string | null,
 *     product_url?:         string | null,
 *     product_platform?:    string | null,
 *     product_price_cents?: number | null,
 *     coupon_code?:         string | null,
 *   }
 *
 * We deliberately do NOT re-run packaging here — the next packaging pass
 * (first render or regenerate) will pick up the new values. That keeps
 * the write path cheap and idempotent.
 */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const { id: runId } = await ctx.params;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  // Ownership check before mutating.
  const { data: owner, error: ownerErr } = await supabaseAdmin
    .from('ve_runs').select('user_id').eq('id', runId).single();
  if (ownerErr || !owner) return createApiErrorResponse('NOT_FOUND', 'Run not found', 404, correlationId);
  if (owner.user_id !== auth.user.id && !auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Run belongs to another user', 403, correlationId);
  }

  const patch: Record<string, unknown> = {};

  if ('product_name' in body) patch.product_name = coerceStringOrNull(body.product_name, 200);
  if ('product_url' in body) {
    const url = coerceStringOrNull(body.product_url, 2048);
    if (url !== null && !isHttpUrl(url)) {
      return createApiErrorResponse('BAD_REQUEST', 'product_url must be an http(s) URL', 400, correlationId);
    }
    patch.product_url = url;
  }
  if ('product_platform' in body) {
    const p = coerceStringOrNull(body.product_platform, 40);
    if (p !== null && !ALLOWED_PLATFORMS.has(p)) {
      return createApiErrorResponse(
        'BAD_REQUEST',
        `Unknown product_platform. Allowed: ${Array.from(ALLOWED_PLATFORMS).join(', ')}`,
        400,
        correlationId,
      );
    }
    patch.product_platform = p;
  }
  if ('product_price_cents' in body) {
    const v = body.product_price_cents;
    if (v === null) patch.product_price_cents = null;
    else if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100_000_00) patch.product_price_cents = v;
    else return createApiErrorResponse('BAD_REQUEST', 'product_price_cents must be an integer in [0, 10000000]', 400, correlationId);
  }
  if ('coupon_code' in body) patch.coupon_code = coerceStringOrNull(body.coupon_code, 60);

  if (Object.keys(patch).length === 0) {
    return createApiErrorResponse('BAD_REQUEST', 'No updatable fields provided', 400, correlationId);
  }

  patch.updated_at = new Date().toISOString();

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('ve_runs')
    .update(patch)
    .eq('id', runId)
    .select('id,product_name,product_url,product_platform,product_price_cents,coupon_code,updated_at')
    .single();

  if (updErr || !updated) {
    console.error(`[${correlationId}] ve-runs PATCH failed:`, updErr);
    return createApiErrorResponse('DB_ERROR', `Failed to update run: ${updErr?.message ?? 'unknown'}`, 500, correlationId);
  }

  return NextResponse.json({ ok: true, data: updated, correlation_id: correlationId });
}

function coerceStringOrNull(v: unknown, maxLen: number): string | null {
  if (v === null) return null;
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLen);
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
