/**
 * FlashFlow Edit Worker — main loop.
 *
 * Polls Supabase for queued render_jobs, claims one atomically via the
 * `claim_render_job` RPC, runs a preview render, and writes the result
 * back to the row. Retries are capped via `render_jobs.max_attempts`
 * (the RPC's inner SELECT filters `attempts < max_attempts`).
 *
 * Runs as a pull-based daemon: outbound network only. No inbound ports.
 * Designed for a Mac mini (or any always-on box) with internet + the
 * Supabase service-role key in its env.
 *
 * Environment:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   EDIT_WORKER_ID                (default: `worker-<hostname>`)
 *   EDIT_WORKER_POLL_INTERVAL_MS  (default: 3000)
 *   EDIT_WORKER_STORAGE_BUCKET    (default: edit-jobs)
 *   EDIT_WORKER_TMP_DIR           (default: os.tmpdir/flashflow-edit-worker)
 *   WORKER_RUN_ONCE               (if set, process one job then exit)
 */
import 'dotenv/config';
import os from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { claimNextJob, markJobCompleted, markJobFailed, appendLog } from './claim.js';
import { renderPreview, ensureTmpRoot } from './render.js';

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[edit-worker] missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const SUPABASE_URL = required('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY');
const WORKER_ID = process.env.EDIT_WORKER_ID || `worker-${os.hostname()}`;
const POLL_INTERVAL_MS = Number(process.env.EDIT_WORKER_POLL_INTERVAL_MS || 3000);
const BUCKET = process.env.EDIT_WORKER_STORAGE_BUCKET || 'edit-jobs';
const RUN_ONCE = process.env.WORKER_RUN_ONCE === '1' || process.env.WORKER_RUN_ONCE === 'true';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let stopping = false;
process.on('SIGINT', () => { stopping = true; console.log('[edit-worker] SIGINT received, stopping after current job'); });
process.on('SIGTERM', () => { stopping = true; });

async function tick(tmpRoot: string): Promise<'claimed' | 'idle' | 'error'> {
  let job;
  try {
    job = await claimNextJob(supabase, WORKER_ID);
  } catch (e) {
    console.error('[edit-worker] claim error:', (e as Error).message);
    return 'error';
  }
  if (!job) return 'idle';

  console.log(`[edit-worker] claimed job ${job.id} (attempt ${job.attempts}/${job.max_attempts})`);

  try {
    await appendLog(supabase, job.id, {
      step: 'claimed', level: 'info', message: `claimed by ${WORKER_ID}`,
    });

    if (job.render_kind !== 'preview') {
      throw new Error(`unsupported render_kind: ${job.render_kind} (Phase 2 is preview-only)`);
    }

    const { storagePath } = await renderPreview({
      supabase,
      jobId: job.id,
      userId: job.user_id,
      projectId: job.edit_project_id,
      planId: job.edit_plan_id,
      bucket: BUCKET,
      tmpRoot,
    });

    // Resolve a signed URL for the artifact (valid for 7 days). Clients can
    // refresh via the app if needed.
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

    await markJobCompleted(supabase, job.id, {
      preview_url: signed?.signedUrl ?? null ?? undefined,
      output_url: storagePath,
    });

    console.log(`[edit-worker] completed job ${job.id} → ${storagePath}`);
    return 'claimed';
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error(`[edit-worker] job ${job.id} failed:`, msg);
    await appendLog(supabase, job.id, { step: 'error', level: 'error', message: msg });

    // Retry policy: if we still have attempts left, requeue. Otherwise fail
    // hard. `attempts` was already incremented inside claim_render_job, so
    // compare against max_attempts as-is.
    if (job.attempts < job.max_attempts) {
      // Re-queue — another worker (or the next tick of this one) will retry.
      try {
        await supabase
          .from('render_jobs')
          .update({ status: 'queued', worker_id: null, error_message: msg.slice(0, 2000) })
          .eq('id', job.id);
        await appendLog(supabase, job.id, {
          step: 'requeue', level: 'warn', message: `requeued after failure (${job.attempts}/${job.max_attempts})`,
        });
      } catch (re) {
        console.error('[edit-worker] requeue failed:', (re as Error).message);
      }
    } else {
      await markJobFailed(supabase, job.id, msg).catch((fe) => {
        console.error('[edit-worker] markJobFailed error:', (fe as Error).message);
      });
    }
    return 'error';
  }
}

async function main() {
  const tmpRoot = await ensureTmpRoot(process.env.EDIT_WORKER_TMP_DIR);
  console.log(`[edit-worker] starting ${WORKER_ID} (tmp=${tmpRoot}, poll=${POLL_INTERVAL_MS}ms, run_once=${RUN_ONCE})`);

  while (!stopping) {
    const result = await tick(tmpRoot);
    if (RUN_ONCE) {
      console.log(`[edit-worker] run-once done (result=${result}); exiting`);
      return;
    }
    if (result === 'idle') {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    } else if (result === 'error') {
      // Back off briefly on error to avoid hot-looping.
      await new Promise((r) => setTimeout(r, Math.max(POLL_INTERVAL_MS, 2000)));
    }
    // On 'claimed' (success), loop immediately — there may be more.
  }

  console.log('[edit-worker] stopped cleanly');
}

main().catch((e) => {
  console.error('[edit-worker] fatal:', e);
  process.exit(1);
});
