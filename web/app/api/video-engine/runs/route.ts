/**
 * POST /api/video-engine/runs   — create a new generation run from an uploaded asset
 * GET  /api/video-engine/runs   — list this user's runs
 *
 * Body for POST:
 * {
 *   storage_path: string,           // path within the `renders` bucket (from /api/creator/upload-urls)
 *   storage_url:  string,
 *   filename:     string,
 *   byte_size?:   number,
 *   mime_type?:   string,
 *   duration_sec?: number,          // hint; will be backfilled by transcription
 *   mode?:         'affiliate' | 'nonprofit',   // default 'affiliate'
 *   preset_keys?:  string[],        // optional, otherwise mode defaults
 *   target_clip_count?: number,     // 1..8, default 4
 *   context?:      Record<string, unknown>      // event_name, mission_text, sponsor_name, product_name, ...
 * }
 *
 * Plan limits (from lib/video-engine/limits.ts) cap:
 *   - max source video length
 *   - max clips per run
 *   - allowed template keys (basic vs all)
 *   - monthly upload count
 *   - watermark on/off (snapshotted to ve_runs.watermark)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { isMode, getMode } from '@/lib/video-engine/modes';
import { resolveRenderTemplateKeys } from '@/lib/video-engine/templates';
import {
  getVEPlan,
  checkUploadAllowed,
  filterTemplatesByPlan,
} from '@/lib/video-engine/limits';

export const runtime = 'nodejs';

const BUCKET = 'renders';

interface CreateBody {
  storage_path: string;
  storage_url: string;
  filename?: string;
  byte_size?: number;
  mime_type?: string;
  duration_sec?: number;
  mode?: string;
  /** Public-facing workspace selector. Maps to mode under the hood. */
  workspace?: 'creator' | 'brand_agency';
  /** Optional intent hint stored in context_json for downstream scoring. */
  goal?: 'sell' | 'promote' | 'reach' | 'story' | null;
  preset_keys?: string[];
  /** Optional. When omitted the engine picks based on the user's plan cap. */
  target_clip_count?: number;
  context?: Record<string, unknown>;
}

function workspaceToMode(w: string | undefined): 'affiliate' | 'nonprofit' | null {
  if (w === 'creator') return 'affiliate';
  if (w === 'brand_agency') return 'nonprofit';
  return null;
}

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  let body: CreateBody;
  try { body = await request.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  console.log('[video-engine/runs] RUN CREATE BODY:', JSON.stringify({ ...body, user_id: auth.user.id, correlation_id: correlationId }));

  if (!body.storage_path || !body.storage_url) {
    return createApiErrorResponse('BAD_REQUEST', 'storage_path and storage_url are required', 400, correlationId);
  }
  // Prefer explicit `workspace`; fall back to legacy `mode`. Default to creator/affiliate.
  const mode = workspaceToMode(body.workspace) ?? body.mode ?? 'affiliate';
  if (!isMode(mode)) {
    return createApiErrorResponse('BAD_REQUEST', `Unknown workspace`, 400, correlationId);
  }
  // Merge optional goal into context_json so scoring/templates can pick it up later
  // without exposing it as a top-level field.
  const mergedContext: Record<string, unknown> = { ...(body.context ?? {}) };
  if (body.goal) mergedContext.goal = body.goal;

  // ── Plan resolution + caps ──────────────────────────────────────────────
  const plan = await getVEPlan(auth.user.id);

  // PAYG users without an active subscription must check out per upload.
  // For V1 we surface this as a 402 with the plan info; the UI redirects to
  // /upgrade or to the per-upload checkout flow once it exists.
  if (plan.planId === 'payg' && !auth.isAdmin) {
    return NextResponse.json({
      ok: false,
      error: {
        code: 'PAYG_CHECKOUT_REQUIRED',
        message: 'Pay-as-you-go uploads require checkout. Subscribe to Starter ($19/mo) for 10 uploads/month or pay $5 per upload.',
        plan: plan.planId,
        upgrade_url: '/upgrade',
      },
      correlation_id: correlationId,
    }, { status: 402 });
  }

  // Monthly upload cap.
  const usage = await checkUploadAllowed(auth.user.id, plan);
  if (!usage.allowed) {
    return NextResponse.json({
      ok: false,
      error: {
        code: 'PLAN_LIMIT_UPLOADS',
        message: usage.upgradeMessage ?? 'Monthly upload cap reached.',
        plan: plan.planId,
        upgrade_to: usage.upgradeTo,
        upgrade_url: '/upgrade',
      },
      correlation_id: correlationId,
    }, { status: 402 });
  }

  // Source duration cap (cheap upstream guard; transcription re-validates).
  if (body.duration_sec && body.duration_sec > plan.maxSourceSec) {
    return NextResponse.json({
      ok: false,
      error: {
        code: 'PLAN_LIMIT_DURATION',
        message: `Source video exceeds the ${Math.round(plan.maxSourceSec / 60)}-minute cap on the ${plan.name} plan.`,
        plan: plan.planId,
        upgrade_url: '/upgrade',
      },
      correlation_id: correlationId,
    }, { status: 400 });
  }

  // Clip count: when the client doesn't supply a target the engine picks based
  // on the user's plan cap. Variable-output is the default — weak footage can
  // still produce fewer real clips downstream.
  const clientSpecifiedTarget = typeof body.target_clip_count === 'number';
  const requestedTarget = clientSpecifiedTarget
    ? Math.min(8, Math.max(1, body.target_clip_count!))
    : plan.maxClipsPerRun;
  const target = Math.min(requestedTarget, plan.maxClipsPerRun);
  const targetClippedByPlan = clientSpecifiedTarget && target < requestedTarget;

  // Filter pinned preset_keys by plan-allowed templates.
  const modeCfg = getMode(mode);
  const requestedKeys = resolveRenderTemplateKeys(mode, body.preset_keys ?? null, target, modeCfg.defaultTemplateKeys);
  const { allowed: resolvedPresets, removed: removedPresets } = filterTemplatesByPlan(requestedKeys, plan);
  // If the filter killed everything, fall back to the mode default *intersected* with allowed.
  const finalPresets = resolvedPresets.length > 0
    ? resolvedPresets
    : filterTemplatesByPlan(modeCfg.defaultTemplateKeys, plan).allowed;
  if (finalPresets.length === 0) {
    return NextResponse.json({
      ok: false,
      error: {
        code: 'NO_TEMPLATES_AVAILABLE',
        message: `No templates available for the ${plan.name} plan in ${mode} mode. This shouldn't happen — contact support.`,
      },
      correlation_id: correlationId,
    }, { status: 500 });
  }

  // ── Insert run + asset ──────────────────────────────────────────────────
  const { data: runRow, error: runErr } = await supabaseAdmin
    .from('ve_runs')
    .insert({
      user_id: auth.user.id,
      mode,
      preset_keys: finalPresets,
      target_clip_count: target,
      context_json: mergedContext,
      status: 'created',
      plan_id_at_run: plan.planId,
      watermark: plan.watermark,
      source_duration_sec: body.duration_sec ?? null,
    })
    .select('id,created_at')
    .single();
  console.log('[video-engine/runs] SUPABASE ve_runs INSERT:', { data: runRow, error: runErr, correlation_id: correlationId });
  if (runErr || !runRow) {
    return createApiErrorResponse('DB_ERROR', `Failed to create run: ${runErr?.message}`, 500, correlationId);
  }

  const { data: assetRow, error: assetErr } = await supabaseAdmin
    .from('ve_assets')
    .insert({
      run_id: runRow.id,
      user_id: auth.user.id,
      storage_bucket: BUCKET,
      storage_path: body.storage_path,
      storage_url: body.storage_url,
      original_filename: body.filename ?? null,
      mime_type: body.mime_type ?? 'video/mp4',
      byte_size: body.byte_size ?? null,
      duration_sec: body.duration_sec ?? null,
    })
    .select('id')
    .single();
  console.log('[video-engine/runs] SUPABASE ve_assets INSERT:', { data: assetRow, error: assetErr, correlation_id: correlationId });
  if (assetErr || !assetRow) {
    await supabaseAdmin.from('ve_runs').delete().eq('id', runRow.id);
    return createApiErrorResponse('DB_ERROR', `Failed to create asset: ${assetErr?.message}`, 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: {
      run_id: runRow.id,
      asset_id: assetRow.id,
      mode,
      preset_keys: finalPresets,
      target_clip_count: target,
      status: 'created',
      plan: {
        id: plan.planId,
        name: plan.name,
        watermark: plan.watermark,
      },
      nudges: {
        clipped_by_plan: targetClippedByPlan
          ? {
              requested: requestedTarget,
              capped_to: target,
              upgrade_message: 'Want more versions? Upgrade for up to 8 clips per upload.',
            }
          : null,
        templates_filtered: removedPresets.length > 0
          ? {
              removed: removedPresets,
              upgrade_message: 'Unlock all styles by upgrading to Creator or Pro.',
            }
          : null,
        watermark_active: plan.watermark
          ? { upgrade_message: 'Remove the watermark by upgrading to Creator.' }
          : null,
      },
    },
    correlation_id: correlationId,
  });
}

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const url = new URL(request.url);
  const limit = Math.min(50, Number(url.searchParams.get('limit') ?? 20));

  const { data, error } = await supabaseAdmin
    .from('ve_runs')
    .select('id,mode,status,target_clip_count,preset_keys,error_message,created_at,updated_at,completed_at,plan_id_at_run,watermark,detected_intent,notify_state')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);

  return NextResponse.json({ ok: true, data: { runs: data ?? [] }, correlation_id: correlationId });
}
