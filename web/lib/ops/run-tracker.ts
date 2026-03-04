/**
 * Generic run tracking via ff_cron_runs.
 *
 * Provides start/finish helpers, recent-run queries, and DB-level
 * idempotency locks for any cron job.
 * Used by RI ingestion, nightly-draft, orchestrator, and the ops-health API.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { RunSource } from '@/lib/ops/run-source';

export interface CronRun {
  id: string;
  job: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'ok' | 'error';
  error: string | null;
  meta: Record<string, unknown>;
  run_source: RunSource | null;
  requested_by: string | null;
}

export interface StartRunOptions {
  job: string;
  meta?: Record<string, unknown>;
  run_source?: RunSource;
  requested_by?: string | null;
}

/**
 * Insert a new 'running' row into ff_cron_runs.
 * Returns the row id for later finishRun().
 */
export async function startRun(
  jobOrOpts: string | StartRunOptions,
  meta: Record<string, unknown> = {},
): Promise<string> {
  const opts = typeof jobOrOpts === 'string'
    ? { job: jobOrOpts, meta }
    : jobOrOpts;

  const row: Record<string, unknown> = {
    job: opts.job,
    status: 'running',
    meta: opts.meta ?? meta,
  };
  if (opts.run_source) row.run_source = opts.run_source;
  if (opts.requested_by) row.requested_by = opts.requested_by;

  const { data, error } = await supabaseAdmin
    .from('ff_cron_runs')
    .insert(row)
    .select('id')
    .single();

  if (error) throw new Error(`startRun(${opts.job}) failed: ${error.message}`);
  return data.id;
}

/**
 * Update a running row with final status, meta, and optional error.
 */
export async function finishRun(
  runId: string,
  status: 'ok' | 'error',
  meta: Record<string, unknown> = {},
  error?: string,
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    finished_at: new Date().toISOString(),
    meta,
  };
  if (error) update.error = error;

  const { error: dbError } = await supabaseAdmin
    .from('ff_cron_runs')
    .update(update)
    .eq('id', runId);

  if (dbError) {
    console.error(`[run-tracker] finishRun(${runId}) failed:`, dbError.message);
  }
}

/**
 * Get the last N runs for a job, newest first.
 */
export async function getRecentRuns(
  job: string,
  limit = 10,
): Promise<CronRun[]> {
  const { data, error } = await supabaseAdmin
    .from('ff_cron_runs')
    .select('*')
    .eq('job', job)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`[run-tracker] getRecentRuns(${job}) failed:`, error.message);
    return [];
  }
  return (data ?? []) as CronRun[];
}

/**
 * Get the most recent run for a job, optionally filtered by status.
 */
export async function getLastRun(
  job: string,
  statusFilter?: 'running' | 'ok' | 'error',
): Promise<CronRun | null> {
  let query = supabaseAdmin
    .from('ff_cron_runs')
    .select('*')
    .eq('job', job)
    .order('started_at', { ascending: false })
    .limit(1);

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`[run-tracker] getLastRun(${job}) failed:`, error.message);
    return null;
  }
  return (data?.[0] as CronRun) ?? null;
}

// ── DB-level idempotency lock ────────────────────────────────────────────────

/**
 * Check if a job is currently running (DB-level lock).
 *
 * Returns the running row if found within TTL, or null if no active run.
 * TTL prevents stale 'running' rows from blocking forever (e.g. if a
 * process crashed without calling finishRun).
 */
export async function isJobRunning(
  job: string,
  ttlMinutes = 15,
): Promise<CronRun | null> {
  const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('ff_cron_runs')
    .select('*')
    .eq('job', job)
    .eq('status', 'running')
    .gte('started_at', cutoff)
    .order('started_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error(`[run-tracker] isJobRunning(${job}) failed:`, error.message);
    // Fail open — don't block on DB errors
    return null;
  }

  return (data?.[0] as CronRun) ?? null;
}

/**
 * Acquire a DB-level run lock: check if job is already running,
 * and if not, insert a new 'running' row atomically.
 *
 * Returns { acquired: true, runId } if lock acquired,
 * or { acquired: false, existingRun } if another run is active.
 */
export async function acquireDbRunLock(
  opts: StartRunOptions & { ttlMinutes?: number },
): Promise<
  | { acquired: true; runId: string }
  | { acquired: false; existingRun: CronRun }
> {
  const ttl = opts.ttlMinutes ?? 15;

  const existing = await isJobRunning(opts.job, ttl);
  if (existing) {
    return { acquired: false, existingRun: existing };
  }

  const runId = await startRun(opts);
  return { acquired: true, runId };
}
