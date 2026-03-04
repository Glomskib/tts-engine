/**
 * Core agent dispatch service.
 *
 * Validates job_type, enforces idempotency via DB UNIQUE constraint,
 * guards against concurrent execution, and tracks runs in ff_cron_runs.
 *
 * Canonical execution path — both /api/internal/agent-dispatch and
 * /api/admin/command-center/dispatch route through this function.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { startRun, finishRun } from '@/lib/ops/run-tracker';
import type { RunSource } from '@/lib/ops/run-source';
import { HANDLERS } from '@/lib/flashflow/dispatch-handlers';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DispatchRequest {
  job_type: string;
  payload?: Record<string, unknown>;
  idempotency_key: string;
  requested_by?: string;
  run_source?: RunSource;
}

export interface DispatchResponse {
  status: 'ok' | 'error' | 'skipped';
  run_id: string | null;
  summary: Record<string, unknown> | null;
  error: string | null;
  idempotent_hit: boolean;
}

// ── Concurrency guard TTL (minutes) ─────────────────────────────────────────

const RUNNING_TTL_MINUTES = 15;

// ── Dispatch ─────────────────────────────────────────────────────────────────

export async function dispatch(req: DispatchRequest): Promise<DispatchResponse> {
  const {
    job_type,
    idempotency_key,
    payload = {},
    requested_by,
    run_source = 'dispatch',
  } = req;

  // 1. Validate job_type exists in handler registry
  const handler = HANDLERS[job_type];
  if (!handler) {
    return {
      status: 'error',
      run_id: null,
      summary: null,
      error: `Unknown job_type: ${job_type}. Valid types: ${Object.keys(HANDLERS).join(', ')}`,
      idempotent_hit: false,
    };
  }

  // 1b. Per-job payload validation
  const payloadErr = validatePayload(job_type, payload);
  if (payloadErr) {
    return {
      status: 'error',
      run_id: null,
      summary: null,
      error: payloadErr,
      idempotent_hit: false,
    };
  }

  // 2. Try INSERT — UNIQUE(job_type, idempotency_key) catches duplicates
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('ff_agent_dispatch')
    .insert({
      job_type,
      idempotency_key,
      payload,
      status: 'pending',
      requested_by: requested_by || null,
    })
    .select('id')
    .single();

  if (insertErr) {
    // UNIQUE violation → idempotent hit
    if (insertErr.code === '23505') {
      const { data: existing } = await supabaseAdmin
        .from('ff_agent_dispatch')
        .select('*')
        .eq('job_type', job_type)
        .eq('idempotency_key', idempotency_key)
        .single();

      if (existing) {
        return {
          status: existing.status === 'error' ? 'error' : (existing.status as 'ok' | 'skipped'),
          run_id: existing.run_id,
          summary: existing.summary,
          error: existing.error,
          idempotent_hit: true,
        };
      }
    }

    return {
      status: 'error',
      run_id: null,
      summary: null,
      error: `DB insert failed: ${insertErr.message}`,
      idempotent_hit: false,
    };
  }

  const dispatchId = inserted.id;

  // 3. Concurrency guard — skip if another instance of this job is running
  const cutoff = new Date(Date.now() - RUNNING_TTL_MINUTES * 60 * 1000).toISOString();
  const { data: runningRows } = await supabaseAdmin
    .from('ff_agent_dispatch')
    .select('id, created_at')
    .eq('job_type', job_type)
    .eq('status', 'running')
    .gte('created_at', cutoff)
    .neq('id', dispatchId)
    .limit(1);

  if (runningRows && runningRows.length > 0) {
    await updateDispatchRow(dispatchId, 'skipped', {
      reason: 'concurrent_run',
      blocked_by: runningRows[0].id,
    });
    return {
      status: 'skipped',
      run_id: null,
      summary: { reason: 'Job already running', blocked_by: runningRows[0].id },
      error: null,
      idempotent_hit: false,
    };
  }

  // 3b. Browser-required guardrail — skip cleanly on serverless
  if (handler.meta?.requires_browser) {
    const isServerless = !!process.env.VERCEL;
    if (isServerless) {
      const skipSummary = {
        reason: 'requires_browser_runtime',
        job_type,
        runtime: 'vercel_serverless',
      };
      await updateDispatchRow(dispatchId, 'skipped', skipSummary);

      // Also record in ff_cron_runs for visibility in ops-health
      try {
        const skipRunId = await startRun({
          job: `agent:${job_type}`,
          meta: { dispatch_id: dispatchId, ...skipSummary },
          run_source,
          requested_by: requested_by || null,
        });
        await finishRun(skipRunId, 'error', skipSummary, 'requires browser runtime');
      } catch {
        // non-fatal — dispatch skip is already recorded
      }

      return {
        status: 'skipped',
        run_id: null,
        summary: skipSummary,
        error: 'requires browser runtime — cannot run in Vercel serverless',
        idempotent_hit: false,
      };
    }
  }

  // 4. Start run tracking
  let runId: string;
  try {
    runId = await startRun({
      job: `agent:${job_type}`,
      meta: { dispatch_id: dispatchId, idempotency_key, payload },
      run_source,
      requested_by: requested_by || null,
    });
  } catch (err: any) {
    await updateDispatchRow(dispatchId, 'error', null, `startRun failed: ${err.message}`);
    return {
      status: 'error',
      run_id: null,
      summary: null,
      error: `startRun failed: ${err.message}`,
      idempotent_hit: false,
    };
  }

  // 5. Update dispatch row to running
  await supabaseAdmin
    .from('ff_agent_dispatch')
    .update({ status: 'running', run_id: runId })
    .eq('id', dispatchId);

  // 6. Execute handler
  // Inject dispatch context into payload for handlers that need it
  const enrichedPayload = {
    ...payload,
    _run_source: run_source,
    _requested_by: requested_by || 'dispatch-api',
    _idempotency_key: idempotency_key,
    _run_id: runId,
  };

  try {
    const result = await handler.execute(enrichedPayload);

    const finalStatus = result.status; // 'ok' | 'error'
    await finishRun(runId, finalStatus, result.summary, result.error);
    await updateDispatchRow(dispatchId, finalStatus, result.summary, result.error);

    return {
      status: finalStatus,
      run_id: runId,
      summary: result.summary,
      error: result.error || null,
      idempotent_hit: false,
    };
  } catch (err: any) {
    const errMsg = err.message || String(err);
    await finishRun(runId, 'error', {}, errMsg);
    await updateDispatchRow(dispatchId, 'error', null, errMsg);

    return {
      status: 'error',
      run_id: runId,
      summary: null,
      error: errMsg,
      idempotent_hit: false,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Per-job payload validation. Returns error string or null if valid. */
function validatePayload(
  jobType: string,
  payload: Record<string, unknown>,
): string | null {
  if (jobType === 'external_research') {
    if (typeof payload.query !== 'string' || !payload.query) {
      return 'external_research requires payload.query (string)';
    }
    if (payload.targets !== undefined && !Array.isArray(payload.targets)) {
      return 'external_research payload.targets must be an array if provided';
    }
    if (payload.mode !== undefined && typeof payload.mode !== 'string') {
      return 'external_research payload.mode must be a string if provided';
    }
  }
  return null;
}

async function updateDispatchRow(
  id: string,
  status: string,
  summary: Record<string, unknown> | null,
  error?: string,
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    finished_at: new Date().toISOString(),
  };
  if (summary !== null) update.summary = summary;
  if (error) update.error = error;

  await supabaseAdmin
    .from('ff_agent_dispatch')
    .update(update)
    .eq('id', id);
}
