/**
 * @module flashflow/agent-queue
 *
 * Claim-based work queue for agent tasks.
 * Follows the same non-throwing pattern as lib/flashflow/issues.ts.
 *
 * Status lifecycle: pending → claimed → running → done / failed
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { logIssueAction } from '@/lib/flashflow/issues';
import { safeInsert } from '@/lib/db/safeInsert';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentQueueRow {
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
}

// ---------------------------------------------------------------------------
// enqueueAgentTask
// ---------------------------------------------------------------------------

/**
 * Insert a new task into ff_agent_queue. Logs an 'enqueue' action if issue_id
 * is provided. Non-throwing — returns null on failure.
 */
export async function enqueueAgentTask(
  issue_id: string | null,
  task_type: string,
  payload: Record<string, unknown>,
  priority: number = 500,
): Promise<AgentQueueRow | null> {
  const result = await safeInsert(
    () =>
      supabaseAdmin
        .from('ff_agent_queue')
        .insert({
          issue_id,
          task_type,
          payload_json: payload,
          priority,
        })
        .select()
        .single(),
    { tag: 'ff_agent_queue' },
  );

  if (!result.ok) {
    console.error('[ff:agent-queue] enqueueAgentTask failed:', result.error.message);
    return null;
  }

  const data = result.data as unknown as AgentQueueRow;

  // Log action on the linked issue (fire-and-forget)
  if (issue_id) {
    logIssueAction(issue_id, 'enqueue', {
      task_id: data.id,
      task_type,
      priority,
    }).catch(() => {});
  }

  return data;
}

// ---------------------------------------------------------------------------
// claimNextTask
// ---------------------------------------------------------------------------

/**
 * Atomically claim the next pending task using FOR UPDATE SKIP LOCKED.
 * Calls the ff_claim_next_task Postgres function via RPC.
 * Non-throwing — returns null if no tasks available or on failure.
 */
export async function claimNextTask(
  worker_id: string,
): Promise<AgentQueueRow | null> {
  try {
    const { data, error } = await supabaseAdmin.rpc('ff_claim_next_task', {
      p_worker_id: worker_id,
    });

    if (error) {
      console.error('[ff:agent-queue] claimNextTask failed:', error.message);
      return null;
    }

    // RPC returns an array (SETOF); take the first row
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    return row as AgentQueueRow;
  } catch (err) {
    console.error('[ff:agent-queue] claimNextTask exception:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// markRunning
// ---------------------------------------------------------------------------

/**
 * Transition a claimed task to running. Sets started_at. Non-throwing.
 */
export async function markRunning(
  task_id: string,
): Promise<AgentQueueRow | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ff_agent_queue')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .eq('id', task_id)
      .select()
      .single();

    if (error) {
      console.error('[ff:agent-queue] markRunning failed:', error.message);
      return null;
    }

    return data as AgentQueueRow;
  } catch (err) {
    console.error('[ff:agent-queue] markRunning exception:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// completeTask
// ---------------------------------------------------------------------------

/**
 * Mark a task as done with result output. Sets finished_at. Non-throwing.
 */
export async function completeTask(
  task_id: string,
  result: Record<string, unknown>,
): Promise<AgentQueueRow | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ff_agent_queue')
      .update({
        status: 'done',
        result_json: result,
        finished_at: new Date().toISOString(),
      })
      .eq('id', task_id)
      .select()
      .single();

    if (error) {
      console.error('[ff:agent-queue] completeTask failed:', error.message);
      return null;
    }

    return data as AgentQueueRow;
  } catch (err) {
    console.error('[ff:agent-queue] completeTask exception:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// failTask
// ---------------------------------------------------------------------------

/**
 * Mark a task as failed with an error message. Sets finished_at. Non-throwing.
 */
export async function failTask(
  task_id: string,
  errorMessage: string,
): Promise<AgentQueueRow | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ff_agent_queue')
      .update({
        status: 'failed',
        error: errorMessage,
        finished_at: new Date().toISOString(),
      })
      .eq('id', task_id)
      .select()
      .single();

    if (error) {
      console.error('[ff:agent-queue] failTask failed:', error.message);
      return null;
    }

    return data as AgentQueueRow;
  } catch (err) {
    console.error('[ff:agent-queue] failTask exception:', err);
    return null;
  }
}
