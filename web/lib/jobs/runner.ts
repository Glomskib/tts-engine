/**
 * Job Queue — Runner
 *
 * Polls for pending jobs, executes handlers, and updates status.
 * Called by the process-jobs cron endpoint.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getHandler } from './handlers';
import type { Job, JobType } from './types';

const LOG = '[job-runner]';
const BATCH_SIZE = 5;

export interface RunResult {
  processed: number;
  completed: number;
  failed: number;
  retried: number;
}

/**
 * Process a batch of pending jobs.
 */
export async function processJobs(): Promise<RunResult> {
  // Claim pending jobs — oldest first
  const { data: pendingJobs, error: fetchError } = await supabaseAdmin
    .from('jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchError || !pendingJobs?.length) {
    return { processed: 0, completed: 0, failed: 0, retried: 0 };
  }

  let completed = 0;
  let failed = 0;
  let retried = 0;

  for (const row of pendingJobs) {
    const job = row as unknown as Job;
    const handler = getHandler(job.type as JobType);

    if (!handler) {
      console.error(`${LOG} No handler for job type: ${job.type}`);
      await supabaseAdmin
        .from('jobs')
        .update({ status: 'failed', error: `Unknown job type: ${job.type}`, completed_at: new Date().toISOString() })
        .eq('id', job.id);
      failed++;
      continue;
    }

    // Mark as running
    await supabaseAdmin
      .from('jobs')
      .update({ status: 'running', started_at: new Date().toISOString(), attempts: job.attempts + 1 })
      .eq('id', job.id);

    try {
      const result = await handler(job);

      await supabaseAdmin
        .from('jobs')
        .update({
          status: 'completed',
          result,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      completed++;
      console.log(`${LOG} Completed job ${job.id} (${job.type})`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const nextAttempt = job.attempts + 1;

      if (nextAttempt < job.max_attempts) {
        // Retry — put back to pending
        await supabaseAdmin
          .from('jobs')
          .update({
            status: 'pending',
            error: errorMsg,
          })
          .eq('id', job.id);
        retried++;
        console.warn(`${LOG} Job ${job.id} (${job.type}) failed attempt ${nextAttempt}/${job.max_attempts}: ${errorMsg}`);
      } else {
        // Max attempts reached — mark failed
        await supabaseAdmin
          .from('jobs')
          .update({
            status: 'failed',
            error: errorMsg,
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id);
        failed++;
        console.error(`${LOG} Job ${job.id} (${job.type}) permanently failed after ${nextAttempt} attempts: ${errorMsg}`);
      }
    }
  }

  return { processed: pendingJobs.length, completed, failed, retried };
}
