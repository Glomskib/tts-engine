/**
 * Agent dispatch handler registry.
 *
 * Maps job_type strings to execution functions. Three patterns:
 *   - inline:        lightweight, runs in the API process
 *   - child_process: heavy work, spawns `npx tsx <script>` as subprocess
 *   - cron_forward:  calls an internal Vercel cron route via HTTP
 */

import { execFile } from 'child_process';
import * as path from 'path';
import { getSessionIfWithinTTL, getAllSessionStatuses } from '@/lib/session-logger';
import { getLocalSessionHealth } from '@/lib/tiktok/session';
import { getRecentRuns } from '@/lib/ops/run-tracker';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { checkResearchRateLimit, checkFailCooldown, wrapWithTimeout } from '@/lib/ops/research-caps';

// ── Types ────────────────────────────────────────────────────────────────────

export interface HandlerResult {
  status: 'ok' | 'error';
  summary: Record<string, unknown>;
  error?: string;
}

export interface HandlerMeta {
  /** Handler needs a browser runtime (e.g. Playwright on the HP machine) */
  requires_browser?: boolean;
  /** Handler depends on OpenClaw being enabled */
  requires_openclaw?: boolean;
}

export interface DispatchHandler {
  type: 'inline' | 'child_process' | 'cron_forward';
  execute: (payload: Record<string, unknown>) => Promise<HandlerResult>;
  meta?: HandlerMeta;
}

// ── Child process helper ─────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function runScript(
  scriptPath: string,
  args: string[] = [],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<HandlerResult> {
  const absPath = path.resolve(process.cwd(), scriptPath);

  return new Promise((resolve) => {
    const child = execFile(
      'npx',
      ['tsx', absPath, ...args],
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, cwd: process.cwd() },
      (err, stdout, stderr) => {
        if (err) {
          resolve({
            status: 'error',
            summary: { stdout: stdout.slice(-2000), stderr: stderr.slice(-2000) },
            error: err.message,
          });
          return;
        }
        resolve({
          status: 'ok',
          summary: { stdout: stdout.slice(-2000), stderr: stderr.slice(-2000) },
        });
      },
    );

    child.on('error', (e) => {
      resolve({
        status: 'error',
        summary: {},
        error: `spawn error: ${e.message}`,
      });
    });
  });
}

// ── Cron forward helper ──────────────────────────────────────────────────────

function cronForwardHandler(cronPath: string): DispatchHandler {
  return {
    type: 'cron_forward',
    execute: async (payload) => {
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret) {
        return { status: 'error', summary: {}, error: 'CRON_SECRET not configured' };
      }

      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

      const source = (payload._run_source as string) || 'dispatch';
      const requestedBy = (payload._requested_by as string) || 'dispatch-api';

      try {
        const res = await fetch(`${baseUrl}${cronPath}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${cronSecret}`,
            'x-run-source': source,
            'x-requested-by': requestedBy,
          },
        });

        const result = await res.json().catch(() => ({}));

        return {
          status: res.ok ? 'ok' : 'error',
          summary: { cron_status: res.status, cron_path: cronPath, result },
          error: res.ok ? undefined : `Cron endpoint returned ${res.status}`,
        };
      } catch (err: any) {
        return {
          status: 'error',
          summary: { cron_path: cronPath },
          error: `Failed to call ${cronPath}: ${err.message}`,
        };
      }
    },
  };
}

// ── Inline handlers ──────────────────────────────────────────────────────────

const sessionHealthHandler: DispatchHandler = {
  type: 'inline',
  execute: async () => {
    const nodeName = process.env.FF_NODE_ID || 'unknown';

    const [dbSession, allStatuses, localHealth] = await Promise.all([
      getSessionIfWithinTTL({ nodeName, platform: 'tiktok-studio' }),
      getAllSessionStatuses(),
      Promise.resolve(getLocalSessionHealth()),
    ]);

    return {
      status: 'ok',
      summary: {
        node: nodeName,
        db_session_valid: !!dbSession,
        db_session: dbSession
          ? {
              is_valid: dbSession.is_valid,
              last_validated_at: dbSession.last_validated_at,
              expires_at: dbSession.expires_at,
            }
          : null,
        local: localHealth,
        all_platforms: allStatuses.map((s) => ({
          platform: s.platform,
          node: s.node_name,
          is_valid: s.is_valid,
          expires_at: s.expires_at,
        })),
      },
    };
  },
};

const riStatusHandler: DispatchHandler = {
  type: 'inline',
  execute: async () => {
    const runs = await getRecentRuns('ri_ingestion', 5);
    return {
      status: 'ok',
      summary: {
        recent_runs: runs.map((r) => ({
          id: r.id,
          status: r.status,
          started_at: r.started_at,
          finished_at: r.finished_at,
          error: r.error,
          run_source: r.run_source,
        })),
      },
    };
  },
};

// ── Child process handlers ───────────────────────────────────────────────────

const riIngestHandler: DispatchHandler = {
  type: 'child_process',
  execute: async (payload) => {
    const source = (payload.source as string) || 'openclaw';
    return runScript(
      'scripts/revenue-intelligence/run-ingestion.ts',
      ['--source', source],
    );
  },
};

const tiktokNightlyDraftHandler: DispatchHandler = {
  type: 'child_process',
  execute: async () => {
    return runScript('scripts/tiktok-studio/nightly-draft.ts', ['--source', 'openclaw']);
  },
};

const tiktokCheckSessionHandler: DispatchHandler = {
  type: 'child_process',
  meta: { requires_browser: true },
  execute: async () => {
    return runScript('scripts/publish/tiktok-studio/check-session.ts', ['--source', 'openclaw']);
  },
};

// ── External research handler ────────────────────────────────────────────────

const externalResearchHandler: DispatchHandler = {
  type: 'inline',
  meta: { requires_openclaw: true },
  execute: async (payload) => {
    const query = (payload.query as string) || '';
    const targets = (payload.targets as unknown[]) || [];
    const mode = (payload.mode as string) || 'web_fetch';
    const idempotencyKey = (payload._idempotency_key as string) || `research_${Date.now()}`;
    const requestedBy = (payload._requested_by as string) || null;
    const runId = (payload._run_id as string) || null;

    // ── Safety: rate limit ──────────────────────────────────────────────
    try {
      const rateLimit = await checkResearchRateLimit();
      if (!rateLimit.allowed) {
        // Insert a rate_limited row for visibility
        await supabaseAdmin.from('ff_research_jobs').upsert(
          {
            idempotency_key: idempotencyKey,
            job_type: mode,
            query,
            targets,
            status: 'error',
            error: `rate_limited: ${rateLimit.current}/${rateLimit.limit} in the last hour`,
            requested_by: requestedBy,
            run_id: runId,
            finished_at: new Date().toISOString(),
          },
          { onConflict: 'idempotency_key', ignoreDuplicates: false },
        );
        return {
          status: 'error',
          summary: { reason: 'rate_limited', ...rateLimit },
          error: `rate_limited: ${rateLimit.current}/${rateLimit.limit} jobs in the last hour`,
        };
      }
    } catch {
      // fail-open — don't block on rate limit check failure
    }

    // ── Safety: fail cooldown ───────────────────────────────────────────
    try {
      const cooldown = await checkFailCooldown();
      if (cooldown.inCooldown) {
        await supabaseAdmin.from('ff_research_jobs').upsert(
          {
            idempotency_key: idempotencyKey,
            job_type: mode,
            query,
            targets,
            status: 'error',
            error: `fail_cooldown: ${cooldown.cooldownMinutes}min cooldown active (last error: ${cooldown.lastError ?? 'unknown'})`,
            requested_by: requestedBy,
            run_id: runId,
            finished_at: new Date().toISOString(),
          },
          { onConflict: 'idempotency_key', ignoreDuplicates: false },
        );
        return {
          status: 'error',
          summary: { reason: 'fail_cooldown', cooldown_minutes: cooldown.cooldownMinutes },
          error: `fail_cooldown: ${cooldown.cooldownMinutes}min cooldown active`,
        };
      }
    } catch {
      // fail-open
    }

    // ── Insert research job row as running ──────────────────────────────
    const { data: researchRow, error: upsertErr } = await supabaseAdmin
      .from('ff_research_jobs')
      .upsert(
        {
          idempotency_key: idempotencyKey,
          job_type: mode,
          query,
          targets,
          status: 'running',
          requested_by: requestedBy,
          run_id: runId,
        },
        { onConflict: 'idempotency_key', ignoreDuplicates: false },
      )
      .select('id')
      .single();

    if (upsertErr) {
      return {
        status: 'error',
        summary: {},
        error: `ff_research_jobs upsert failed: ${upsertErr.message}`,
      };
    }

    const researchId = researchRow.id;

    // ── Execute with timeout ────────────────────────────────────────────
    try {
      const result = await wrapWithTimeout(async () => {
        // Stub executor — replace with real web_fetch / site_scan / serp_summary
        const stubSummary: Record<string, unknown> = {
          executor: 'stub',
          mode,
          query,
          targets,
          result_count: 0,
          results: [],
          note: 'Stub executor — wire in a real executor to populate results.',
        };
        return stubSummary;
      });

      await supabaseAdmin
        .from('ff_research_jobs')
        .update({ status: 'ok', summary: result, finished_at: new Date().toISOString() })
        .eq('id', researchId);

      return { status: 'ok', summary: { research_job_id: researchId, ...result } };
    } catch (err: any) {
      const errorMsg = err.message || String(err);
      await supabaseAdmin
        .from('ff_research_jobs')
        .update({ status: 'error', error: errorMsg, finished_at: new Date().toISOString() })
        .eq('id', researchId);

      return { status: 'error', summary: { research_job_id: researchId }, error: errorMsg };
    }
  },
};

// ── Registry ─────────────────────────────────────────────────────────────────

export const HANDLERS: Record<string, DispatchHandler> = {
  // Inline
  session_health: sessionHealthHandler,
  ri_status: riStatusHandler,
  external_research: externalResearchHandler,
  // Child process
  ri_ingest: riIngestHandler,
  tiktok_nightly_draft: tiktokNightlyDraftHandler,
  tiktok_check_session: tiktokCheckSessionHandler,
  // Cron forward
  orchestrator: cronForwardHandler('/api/cron/orchestrator'),
  clip_discover: cronForwardHandler('/api/cron/clip-discover'),
  clip_analyze: cronForwardHandler('/api/cron/clip-analyze'),
  brain_dispatch: cronForwardHandler('/api/cron/brain-dispatch'),
};

// ── Job aliases (backward compat for admin dispatch) ─────────────────────────

/** Maps legacy admin dispatch job names → canonical handler keys */
export const JOB_ALIASES: Record<string, string> = {
  // Admin dispatch used dashes; canonical uses underscores
  'clip-discover': 'clip_discover',
  'clip-analyze': 'clip_analyze',
  'brain-dispatch': 'brain_dispatch',
  // Admin dispatch used different names for local-only jobs
  ri_ingestion: 'ri_ingest',
  nightly_draft: 'tiktok_nightly_draft',
};

/** Resolve a job name to its canonical handler key */
export function resolveJobType(name: string): string {
  return JOB_ALIASES[name] ?? name;
}
