/**
 * Inngest function: processes an edit job off the request cycle.
 *
 * Triggered by event `editor/job.process`. Runs the full pipeline via
 * `processEditJob()` (single source of truth in lib/editor/pipeline.ts).
 *
 * Retries: step.run gives us automatic retries for transient failures.
 * Terminal failures (missing key, bad codec, etc.) are caught and written
 * to `ai_edit_jobs.error` as a human-readable sentence via humanizeEditJobError.
 */
import { inngest } from '../client';
import { processEditJob, humanizeEditJobError } from '@/lib/editor/pipeline';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { incrementUsage, getUserPlan, isPaidPlan } from '@/lib/usage/dailyUsage';

export const processEditJobFn = inngest.createFunction(
  {
    id: 'editor-process-job',
    name: 'Editor: process edit job',
    // retries=1: humanizeEditJobError already classifies failures into terminal vs
    // transient. Triple-running the pipeline on bad codecs triple-bills Whisper.
    // The transcript reuse path in pipeline.ts protects retries from re-billing.
    retries: 1,
    concurrency: { limit: 3 },
    triggers: [{ event: 'editor/job.process' }],
  },
  async ({ event, step, logger }) => {
    const { jobId, userId } = event.data as { jobId: string; userId: string };

    try {
      // Single big step — internal phases update their own status rows, and
      // the pipeline itself is idempotent at the completed-state level. If
      // the function is retried Inngest will re-run this step from scratch,
      // which is the safe thing to do for a multi-phase ffmpeg pipeline.
      await step.run('run-pipeline', async () => {
        const plan = await getUserPlan(userId);
        const isPaid = isPaidPlan(plan);
        logger.info('Starting edit pipeline', { jobId, plan, isPaid });
        await processEditJob(jobId, { isPaid });
      });

      await step.run('increment-usage', async () => {
        await incrementUsage(userId, 'renders').catch(() => {});
      });

      return { ok: true, jobId };
    } catch (err) {
      const message = humanizeEditJobError(err);
      logger.error('Edit pipeline failed', { jobId, message });
      await supabaseAdmin
        .from('ai_edit_jobs')
        .update({
          status: 'failed',
          error: message,
          finished_at: new Date().toISOString(),
        })
        .eq('id', jobId);
      // Re-throw so Inngest records it as a failure. NonRetriableError isn't
      // used because humanizeEditJobError already classifies it — Inngest's
      // automatic retry (configured above) will still apply for transient
      // errors; terminal errors will just retry and fail identically, which
      // is acceptable for MVP.
      throw err;
    }
  },
);
