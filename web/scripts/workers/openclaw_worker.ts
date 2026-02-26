#!/usr/bin/env tsx
/**
 * OpenClaw Worker — long-running daemon that claims and executes
 * tasks from ff_agent_queue.
 *
 * Features:
 *   - Atomic claim via ff_claim_next_task RPC (safe for multi-instance)
 *   - Heartbeat / progress updates every 30s while running
 *   - Proof-of-work enforcement on completion
 *   - Telegram alerts on stuck/failed
 *   - DRY_RUN mode for validation without DB mutations
 *
 * Env config:
 *   WORKER_NAME        — unique worker id (default: hostname-pid)
 *   WORKER_POLL_MS     — poll interval when idle (default: 10000)
 *   WORKER_MAX_RUNTIME_MS — max runtime per task (default: 600000 / 10min)
 *   DRY_RUN            — if "true", skip DB mutations
 *
 * Usage:
 *   npx tsx scripts/workers/openclaw_worker.ts
 *   DRY_RUN=true npx tsx scripts/workers/openclaw_worker.ts
 *   ./scripts/workers/with-lock.sh openclaw npx tsx scripts/workers/openclaw_worker.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { hostname } from 'os';
import { TaskHandlerResult, getHandler, KNOWN_TASK_TYPES } from './handlers';

// ── Config ──────────────────────────────────────────────────────────────────

const WORKER_NAME = process.env.WORKER_NAME || `${hostname()}-${process.pid}`;
const POLL_MS = parseInt(process.env.WORKER_POLL_MS || '10000', 10);
const MAX_RUNTIME_MS = parseInt(process.env.WORKER_MAX_RUNTIME_MS || '600000', 10);
const DRY_RUN = process.env.DRY_RUN === 'true';
const HEARTBEAT_INTERVAL_MS = 30_000;
const STATUS_INTERVAL_MS = 60_000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_LOG_CHAT_ID = process.env.TELEGRAM_LOG_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

const PREFIX = '[openclaw-worker]';

// ── Validate env ────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`${PREFIX} FATAL: ${name} not set`);
    process.exit(1);
  }
  return val;
}

const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

// ── Supabase client ─────────────────────────────────────────────────────────

let supabase: SupabaseClient;
function getSupabase(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });
  }
  return supabase;
}

// ── DB types ────────────────────────────────────────────────────────────────

interface QueueRow {
  id: string;
  issue_id: string | null;
  task_type: string;
  payload_json: Record<string, unknown>;
  status: string;
  priority: number;
  worker_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  result_json: Record<string, unknown> | null;
  error: string | null;
  last_heartbeat_at?: string | null;
  last_progress_at?: string | null;
}

// ── Telegram helper ─────────────────────────────────────────────────────────

async function sendTelegram(message: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_LOG_CHAT_ID) return;
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_LOG_CHAT_ID,
          text: message,
          parse_mode: 'HTML',
        }),
      },
    );
  } catch { /* best-effort */ }
}

// ── DB operations ───────────────────────────────────────────────────────────

async function claimNext(): Promise<QueueRow | null> {
  if (DRY_RUN) {
    log('DRY_RUN: would call ff_claim_next_task');
    return null;
  }

  const { data, error } = await getSupabase().rpc('ff_claim_next_task', {
    p_worker_id: WORKER_NAME,
  });

  if (error) {
    log(`claim error: ${error.message}`);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row ? (row as QueueRow) : null;
}

async function markRunning(taskId: string): Promise<boolean> {
  if (DRY_RUN) { log(`DRY_RUN: would mark ${taskId} running`); return true; }

  const now = new Date().toISOString();

  // Try with heartbeat columns first (T3 migration); fall back without
  let result = await getSupabase()
    .from('ff_agent_queue')
    .update({
      status: 'running',
      started_at: now,
      last_heartbeat_at: now,
      last_progress_at: now,
    })
    .eq('id', taskId);

  if (result.error?.message?.includes('could not find') ||
      result.error?.message?.includes('schema cache')) {
    log('heartbeat columns not yet available — falling back');
    result = await getSupabase()
      .from('ff_agent_queue')
      .update({ status: 'running', started_at: now })
      .eq('id', taskId);
  }

  if (result.error) {
    log(`markRunning error: ${result.error.message}`);
    return false;
  }
  return true;
}

async function touchProgress(taskId: string): Promise<void> {
  if (DRY_RUN) return;
  try {
    const now = new Date().toISOString();
    const result = await getSupabase()
      .from('ff_agent_queue')
      .update({ last_heartbeat_at: now, last_progress_at: now })
      .eq('id', taskId)
      .in('status', ['claimed', 'running']);
    // Silently ignore schema errors (T3 migration not yet applied)
    if (result.error?.message?.includes('could not find')) return;
  } catch { /* fire-and-forget */ }
}

async function completeTask(
  taskId: string,
  result: Record<string, unknown>,
): Promise<boolean> {
  // Proof-of-work enforcement
  const proof = result.proof;
  const override = result.no_proof_override;
  const hasProof =
    Array.isArray(proof) &&
    proof.length > 0 &&
    proof.every(
      (p: unknown) =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as { type: string }).type === 'string' &&
        typeof (p as { value: string }).value === 'string',
    );

  if (!hasProof && typeof override !== 'string') {
    log(`REJECTED completion for ${taskId}: missing proof[] or no_proof_override`);
    await failTask(taskId, 'proof-of-work missing: result has no proof[] or no_proof_override');
    return false;
  }

  if (DRY_RUN) { log(`DRY_RUN: would complete ${taskId}`); return true; }

  const { error } = await getSupabase()
    .from('ff_agent_queue')
    .update({
      status: 'done',
      result_json: result,
      finished_at: new Date().toISOString(),
    })
    .eq('id', taskId);

  if (error) {
    log(`completeTask error: ${error.message}`);
    return false;
  }
  return true;
}

async function failTask(taskId: string, errorMsg: string): Promise<boolean> {
  if (DRY_RUN) { log(`DRY_RUN: would fail ${taskId}: ${errorMsg}`); return true; }

  const { error } = await getSupabase()
    .from('ff_agent_queue')
    .update({
      status: 'failed',
      error: errorMsg,
      finished_at: new Date().toISOString(),
    })
    .eq('id', taskId);

  if (error) {
    log(`failTask error: ${error.message}`);
    return false;
  }
  return true;
}

// ── Logging ─────────────────────────────────────────────────────────────────

function log(msg: string): void {
  const ts = new Date().toISOString();
  console.error(`${ts} ${PREFIX} ${msg}`);
}

function statusLine(detail: string): void {
  const ts = new Date().toISOString();
  // Single-line to stdout per ground rules
  console.log(`${ts} STATUS openclaw-worker ${detail}`);
}

// ── Task execution ──────────────────────────────────────────────────────────

async function executeTask(task: QueueRow): Promise<void> {
  const shortId = task.id.slice(0, 8);
  log(`CLAIMED ${shortId} type=${task.task_type} priority=${task.priority}`);

  // 1. Mark running
  if (!(await markRunning(task.id))) {
    log(`Failed to mark ${shortId} running — skipping`);
    return;
  }
  log(`RUNNING ${shortId}`);

  // 2. Set up heartbeat timer
  const heartbeatTimer = setInterval(() => {
    touchProgress(task.id).catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);

  // 3. Set up max runtime timeout
  let timedOut = false;
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
  }, MAX_RUNTIME_MS);

  try {
    // 4. Get handler for task type
    const handler = getHandler(task.task_type);
    if (!handler) {
      log(`No handler for task_type="${task.task_type}" — failing`);
      await failTask(task.id, `no handler for task_type: ${task.task_type}`);
      sendTelegram(
        `<b>Worker ${WORKER_NAME}</b>: no handler for <code>${task.task_type}</code> (task ${shortId})`,
      ).catch(() => {});
      return;
    }

    // 5. Execute handler
    log(`EXEC ${shortId} handler=${task.task_type}`);
    const result: TaskHandlerResult = await handler(task.payload_json, {
      taskId: task.id,
      taskType: task.task_type,
      workerId: WORKER_NAME,
      touchProgress: () => touchProgress(task.id),
      isTimedOut: () => timedOut,
    });

    // 6. Check timeout
    if (timedOut) {
      log(`TIMEOUT ${shortId} after ${MAX_RUNTIME_MS}ms`);
      await failTask(task.id, `max runtime exceeded (${MAX_RUNTIME_MS}ms)`);
      sendTelegram(
        `<b>Worker ${WORKER_NAME}</b>: task ${shortId} timed out after ${Math.round(MAX_RUNTIME_MS / 60000)}min`,
      ).catch(() => {});
      return;
    }

    // 7. Complete with proof-of-work enforcement
    const completed = await completeTask(task.id, result);
    if (completed) {
      log(`DONE ${shortId}`);
    } else {
      log(`FAILED to complete ${shortId} (proof-of-work or DB error)`);
      sendTelegram(
        `<b>Worker ${WORKER_NAME}</b>: task ${shortId} failed proof-of-work check`,
      ).catch(() => {});
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log(`ERROR ${shortId}: ${errMsg}`);
    await failTask(task.id, errMsg);
    sendTelegram(
      `<b>Worker ${WORKER_NAME}</b>: task ${shortId} crashed: ${errMsg.slice(0, 200)}`,
    ).catch(() => {});
  } finally {
    clearInterval(heartbeatTimer);
    clearTimeout(timeoutTimer);
  }
}

// ── Main loop ───────────────────────────────────────────────────────────────

let cycleCount = 0;
let tasksProcessed = 0;
let tasksFailed = 0;
let lastStatusTs = 0;

async function mainLoop(): Promise<void> {
  log(`START worker=${WORKER_NAME} poll=${POLL_MS}ms max_runtime=${MAX_RUNTIME_MS}ms dry_run=${DRY_RUN}`);
  log(`Known task types: ${KNOWN_TASK_TYPES.join(', ')}`);
  statusLine(`started worker=${WORKER_NAME} dry_run=${DRY_RUN}`);

  while (true) {
    cycleCount++;

    try {
      const task = await claimNext();

      if (task) {
        await executeTask(task);
        tasksProcessed++;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log(`LOOP ERROR: ${errMsg}`);
      tasksFailed++;
    }

    // STATUS heartbeat every 60s
    const now = Date.now();
    if (now - lastStatusTs >= STATUS_INTERVAL_MS) {
      statusLine(`cycles=${cycleCount} done=${tasksProcessed} failed=${tasksFailed}`);
      lastStatusTs = now;
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

// ── Graceful shutdown ───────────────────────────────────────────────────────

let shuttingDown = false;

function handleShutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`SHUTDOWN received ${signal}`);
  statusLine(`shutdown signal=${signal} cycles=${cycleCount} done=${tasksProcessed}`);
  process.exit(0);
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// ── Entry ───────────────────────────────────────────────────────────────────

mainLoop().catch((err) => {
  log(`FATAL: ${err}`);
  process.exit(1);
});
