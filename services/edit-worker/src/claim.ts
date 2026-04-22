/**
 * Safe render-job claim via the Postgres `claim_render_job(worker_id)` RPC.
 *
 * The function (see 20260428000000_edit_builder_schema.sql) does an atomic
 * UPDATE ... WHERE id = (SELECT id ... FOR UPDATE SKIP LOCKED LIMIT 1), so
 * multiple workers can poll concurrently without double-processing a job.
 *
 * Retry capping is enforced at the SQL level via `attempts < max_attempts`.
 * This file is deliberately tiny — the worker loop in `index.ts` owns the
 * retry/requeue decision when a rendered job throws.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ClaimedRenderJob {
  id: string;
  user_id: string;
  edit_project_id: string;
  edit_plan_id: string;
  render_kind: 'preview' | 'final';
  worker_id: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  started_at: string | null;
}

export async function claimNextJob(
  supabase: SupabaseClient,
  workerId: string,
): Promise<ClaimedRenderJob | null> {
  const { data, error } = await supabase.rpc('claim_render_job', { p_worker_id: workerId });
  if (error) {
    throw new Error(`claim_render_job RPC failed: ${error.message}`);
  }
  // The RPC returns a single row (or null-equivalent when nothing was claimed).
  if (!data) return null;
  // supabase-js returns RPC row results as an object for single-row returns.
  return data as ClaimedRenderJob;
}

export async function markJobFailed(
  supabase: SupabaseClient,
  jobId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await supabase
    .from('render_jobs')
    .update({
      status: 'failed',
      error_message: errorMessage.slice(0, 2000),
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  if (error) throw new Error(`markJobFailed: ${error.message}`);
}

export async function requeueJob(
  supabase: SupabaseClient,
  jobId: string,
  reason: string,
): Promise<void> {
  // Set back to queued so the next poll can claim it again — attempts was
  // already incremented by claim_render_job(), so the capped-retry rule still
  // applies via the RPC's `attempts < max_attempts` guard.
  const { error } = await supabase
    .from('render_jobs')
    .update({
      status: 'queued',
      worker_id: null,
      error_message: reason.slice(0, 2000),
    })
    .eq('id', jobId);
  if (error) throw new Error(`requeueJob: ${error.message}`);
}

export async function markJobCompleted(
  supabase: SupabaseClient,
  jobId: string,
  patch: { preview_url?: string; output_url?: string },
): Promise<void> {
  const { error } = await supabase
    .from('render_jobs')
    .update({
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
      ...patch,
    })
    .eq('id', jobId);
  if (error) throw new Error(`markJobCompleted: ${error.message}`);
}

export async function setJobProgress(
  supabase: SupabaseClient,
  jobId: string,
  progress: number,
): Promise<void> {
  await supabase.from('render_jobs').update({ progress }).eq('id', jobId);
}

export async function appendLog(
  supabase: SupabaseClient,
  jobId: string,
  entry: { step: string; level: 'info' | 'warn' | 'error'; message: string; meta?: Record<string, unknown> },
): Promise<void> {
  const { error } = await supabase.rpc('append_render_log', {
    p_job_id: jobId,
    p_entry: entry,
  });
  if (error) {
    // Logs are best-effort; don't crash the render loop if logging fails.
    console.error('[edit-worker] append_render_log failed:', error.message);
  }
}
