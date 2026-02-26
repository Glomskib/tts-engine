/**
 * Task handler registry.
 *
 * Each handler receives the task payload and a context object for
 * heartbeats / timeout checking. Returns a result object that MUST
 * include either a `proof` array or `no_proof_override` string.
 */

// ── Types ───────────────────────────────────────────────────────────

export interface TaskHandlerContext {
  taskId: string;
  taskType: string;
  workerId: string;
  /** Call periodically to keep the task alive */
  touchProgress: () => Promise<void>;
  /** Check if max runtime exceeded — handler should bail if true */
  isTimedOut: () => boolean;
}

export interface ProofEntry {
  type: string;   // e.g. 'pr_url', 'commit_sha', 'artifact_id', 'log_hash'
  value: string;
}

export interface TaskHandlerResult {
  summary: string;
  proof?: ProofEntry[];
  no_proof_override?: string;
  [key: string]: unknown;
}

export type TaskHandler = (
  payload: Record<string, unknown>,
  ctx: TaskHandlerContext,
) => Promise<TaskHandlerResult>;

// ── Handler imports ─────────────────────────────────────────────────

import { handleBugFix } from './bug-fix';
import { handleRollback } from './rollback';
import { handleConfigPatch } from './config-patch';
import { handleInvestigation } from './investigation';

// ── Registry ────────────────────────────────────────────────────────

const HANDLERS: Record<string, TaskHandler> = {
  bug_fix: handleBugFix,
  rollback: handleRollback,
  config_patch: handleConfigPatch,
  investigation: handleInvestigation,
};

export const KNOWN_TASK_TYPES = Object.keys(HANDLERS);

export function getHandler(taskType: string): TaskHandler | null {
  return HANDLERS[taskType] ?? null;
}
