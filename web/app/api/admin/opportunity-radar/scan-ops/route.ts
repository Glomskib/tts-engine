/**
 * API: Opportunity Radar — Scan Operations (Mission Control Surface)
 *
 * GET  /api/admin/opportunity-radar/scan-ops — dashboard stats + recent scans
 * POST /api/admin/opportunity-radar/scan-ops — operator actions
 *
 * Actions:
 *   run_due     — enqueue all due scans now
 *   force_scan  — force-scan a specific creator source
 *   retry_failed — re-enqueue failed scans from the last 24h
 *   pause_source — pause a creator source
 *   resume_source — resume a paused creator source
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { getDueScans, getSchedulerStats, logScanResult } from '@/lib/opportunity-radar/scheduler';
import { enqueueJob } from '@/lib/jobs/enqueue';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ── GET: Dashboard stats ────────────────────────────────────────────────

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user || !auth.isAdmin) {
    return createApiErrorResponse('UNAUTHORIZED', 'Admin access required', 401, correlationId);
  }

  try {
    // Scheduler stats
    const stats = await getSchedulerStats();

    // Recent scan logs (last 50)
    const { data: recentScans } = await supabaseAdmin
      .from('creator_scan_log')
      .select('*, source:creator_sources(handle, platform, monitoring_status, consecutive_no_change)')
      .order('created_at', { ascending: false })
      .limit(50);

    // Active/pending scan jobs
    const { data: activeJobs } = await supabaseAdmin
      .from('jobs')
      .select('id, status, payload, created_at, started_at, completed_at, error')
      .eq('type', 'scan_creator')
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: false })
      .limit(20);

    // Recently failed scan jobs (last 24h)
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: failedJobs } = await supabaseAdmin
      .from('jobs')
      .select('id, status, payload, created_at, error')
      .eq('type', 'scan_creator')
      .eq('status', 'failed')
      .gte('created_at', dayAgo)
      .order('created_at', { ascending: false })
      .limit(20);

    // Sources in error state
    const { data: errorSources } = await supabaseAdmin
      .from('creator_sources')
      .select('id, handle, platform, last_check_error, last_checked_at, check_count')
      .eq('monitoring_status', 'error')
      .order('last_checked_at', { ascending: false })
      .limit(20);

    // Sources due for scan
    const dueSources = await getDueScans(20);

    return NextResponse.json({
      ok: true,
      stats,
      due_sources: dueSources.map((s) => ({
        id: s.id,
        handle: s.handle,
        platform: s.platform,
        next_check_at: s.next_check_at,
        last_checked_at: s.last_checked_at,
        scan_interval_hours: s.scan_interval_hours,
        active_watcher_count: s.active_watcher_count,
        has_fingerprint: !!s.last_source_fingerprint,
        consecutive_no_change: s.consecutive_no_change ?? 0,
      })),
      active_jobs: activeJobs ?? [],
      failed_jobs: failedJobs ?? [],
      error_sources: errorSources ?? [],
      recent_scans: (recentScans ?? []).map((s) => ({
        id: s.id,
        creator_source_id: s.creator_source_id,
        handle: s.source?.handle,
        platform: s.source?.platform,
        status: s.status,
        scan_mode: s.scan_mode ?? 'legacy',
        changed: s.changed,
        products_found: s.products_found,
        new_observations: s.new_observations,
        observations_updated: s.observations_updated ?? 0,
        duration_ms: s.duration_ms,
        error_message: s.error_message,
        created_at: s.created_at,
        consecutive_no_change: s.source?.consecutive_no_change ?? 0,
      })),
      correlation_id: correlationId,
    });
  } catch (err) {
    return createApiErrorResponse(
      'INTERNAL',
      err instanceof Error ? err.message : 'Failed to fetch scan ops data',
      500,
      correlationId,
    );
  }
}

// ── POST: Operator actions ──────────────────────────────────────────────

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user || !auth.isAdmin) {
    return createApiErrorResponse('UNAUTHORIZED', 'Admin access required', 401, correlationId);
  }

  const body = await request.json();
  const action = body.action as string;

  switch (action) {
    case 'run_due':
      return handleRunDue(correlationId);

    case 'force_scan':
      return handleForceScan(body.creator_source_id, correlationId);

    case 'retry_failed':
      return handleRetryFailed(correlationId);

    case 'pause_source':
      return handlePauseSource(body.creator_source_id, correlationId);

    case 'resume_source':
      return handleResumeSource(body.creator_source_id, correlationId);

    default:
      return createApiErrorResponse('BAD_REQUEST', `Unknown action: ${action}`, 400, correlationId);
  }
}

// ── Action handlers ─────────────────────────────────────────────────────

async function handleRunDue(correlationId: string) {
  const dueSources = await getDueScans(20);

  if (dueSources.length === 0) {
    return NextResponse.json({ ok: true, enqueued: 0, message: 'No sources due for scanning', correlation_id: correlationId });
  }

  // Check for existing active jobs
  const { data: activeJobs } = await supabaseAdmin
    .from('jobs')
    .select('payload')
    .eq('type', 'scan_creator')
    .in('status', ['pending', 'running']);

  const activeSourceIds = new Set(
    (activeJobs ?? [])
      .map((j) => (j.payload as Record<string, unknown>)?.creator_source_id as string)
      .filter(Boolean),
  );

  let enqueued = 0;
  for (const source of dueSources) {
    if (activeSourceIds.has(source.id)) continue;
    const jobId = await enqueueJob('system', 'scan_creator', {
      creator_source_id: source.id,
      platform: source.platform,
      handle: source.handle,
      scan_reason: 'manual',
    }, 2);
    if (jobId) enqueued++;
  }

  return NextResponse.json({ ok: true, enqueued, due: dueSources.length, correlation_id: correlationId });
}

async function handleForceScan(sourceId: string | undefined, correlationId: string) {
  if (!sourceId) {
    return createApiErrorResponse('BAD_REQUEST', 'creator_source_id is required', 400, correlationId);
  }

  const { data: source, error: srcErr } = await supabaseAdmin
    .from('creator_sources')
    .select('id, handle, platform')
    .eq('id', sourceId)
    .maybeSingle();

  if (srcErr || !source) {
    return createApiErrorResponse('NOT_FOUND', 'Creator source not found', 404, correlationId);
  }

  const jobId = await enqueueJob('system', 'scan_creator', {
    creator_source_id: source.id,
    platform: source.platform,
    handle: source.handle,
    scan_reason: 'manual',
  }, 2);

  return NextResponse.json({
    ok: true,
    job_id: jobId,
    source: { id: source.id, handle: source.handle, platform: source.platform },
    correlation_id: correlationId,
  });
}

async function handleRetryFailed(correlationId: string) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: failedJobs } = await supabaseAdmin
    .from('jobs')
    .select('payload')
    .eq('type', 'scan_creator')
    .eq('status', 'failed')
    .gte('created_at', dayAgo);

  if (!failedJobs || failedJobs.length === 0) {
    return NextResponse.json({ ok: true, retried: 0, message: 'No failed scans in the last 24h', correlation_id: correlationId });
  }

  // Dedupe by creator_source_id
  const sourceMap = new Map<string, Record<string, unknown>>();
  for (const job of failedJobs) {
    const payload = job.payload as Record<string, unknown>;
    const sourceId = payload?.creator_source_id as string;
    if (sourceId && !sourceMap.has(sourceId)) {
      sourceMap.set(sourceId, payload);
    }
  }

  let retried = 0;
  for (const [, payload] of sourceMap) {
    const jobId = await enqueueJob('system', 'scan_creator', {
      ...payload,
      scan_reason: 'manual',
    }, 2);
    if (jobId) retried++;
  }

  return NextResponse.json({ ok: true, retried, total_failed: failedJobs.length, correlation_id: correlationId });
}

async function handlePauseSource(sourceId: string | undefined, correlationId: string) {
  if (!sourceId) {
    return createApiErrorResponse('BAD_REQUEST', 'creator_source_id is required', 400, correlationId);
  }

  const { error } = await supabaseAdmin
    .from('creator_sources')
    .update({ monitoring_status: 'paused' })
    .eq('id', sourceId);

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, action: 'paused', creator_source_id: sourceId, correlation_id: correlationId });
}

async function handleResumeSource(sourceId: string | undefined, correlationId: string) {
  if (!sourceId) {
    return createApiErrorResponse('BAD_REQUEST', 'creator_source_id is required', 400, correlationId);
  }

  const { error } = await supabaseAdmin
    .from('creator_sources')
    .update({
      monitoring_status: 'active',
      last_check_error: null,
      next_check_at: new Date().toISOString(),
    })
    .eq('id', sourceId);

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, action: 'resumed', creator_source_id: sourceId, correlation_id: correlationId });
}
