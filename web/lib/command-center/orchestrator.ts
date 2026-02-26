/**
 * Continuous Orchestration Loop
 *
 * Five sequential passes, each independently safe.
 * If one pass throws, the others still run.
 *
 * Pass 1 — Brain Dispatch   (Vault → MC tasks)
 * Pass 2 — Feedback Enforce (critical bugs → auto-escalated tasks)
 * Pass 3 — Stuck Recovery   (failed agent queue items → retry)
 * Pass 4 — Executor Sync    (agent queue done/failed → MC task status)
 * Pass 5 — Brain Writeback  (completed MC tasks → vault worklogs)
 */
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { logTaskEvent } from '@/lib/command-center/ingest';
import {
  runBrainDispatch,
  vaultAccessible,
  appendWorklogEntry,
  getVaultPath,
  type BrainDispatchReport,
} from '@/Automation/brain_dispatcher';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PassReport {
  pass: string;
  ok: boolean;
  detail: Record<string, unknown>;
}

export interface OrchestratorReport {
  passes: PassReport[];
  timestamp: string;
}

const MAX_AGENT_RETRIES = 3;

/** Vault project key → worklog relative path */
const WORKLOG_REL: Record<string, string> = {
  FlashFlow: 'FlashFlow/_Ops/Worklog.md',
  MMM: 'MMM/_Ops/Worklog.md',
  ZebbysWorld: "Zebby's World/_Ops/Worklog.md",
};

// ---------------------------------------------------------------------------
// Pass 1 — Brain Dispatcher
// ---------------------------------------------------------------------------

async function pass1_brainDispatch(): Promise<PassReport> {
  if (!(await vaultAccessible())) {
    return {
      pass: 'brain-dispatch',
      ok: true,
      detail: { skipped: true, reason: 'vault not accessible' },
    };
  }

  const report: BrainDispatchReport = await runBrainDispatch();
  return {
    pass: 'brain-dispatch',
    ok: report.errors.length === 0,
    detail: {
      dispatched: report.dispatched.length,
      skipped: report.skipped.length,
      errors: report.errors,
    },
  };
}

// ---------------------------------------------------------------------------
// Pass 2 — Feedback Enforcement
//
// Schema reality: ff_feedback_items uses `type` (not category), integer
// priority 1-5 (not P1/P2), and has no linked_task_id column.
// We use `status = 'new'` as the gate and set `status = 'triaged'` +
// add tag 'auto-escalated' after task creation to prevent duplicates.
// ---------------------------------------------------------------------------

async function pass2_feedbackEnforce(): Promise<PassReport> {
  const created: string[] = [];
  const errors: string[] = [];

  // Critical bugs/support not yet triaged
  const { data: items, error: qErr } = await supabaseAdmin
    .from('ff_feedback_items')
    .select('id, title, description, type, priority, tags, reporter_email')
    .eq('status', 'new')
    .in('type', ['bug', 'support'])
    .lte('priority', 2)
    .limit(20);

  if (qErr) {
    return {
      pass: 'feedback-enforce',
      ok: false,
      detail: { error: qErr.message },
    };
  }

  if (!items || items.length === 0) {
    return {
      pass: 'feedback-enforce',
      ok: true,
      detail: { processed: 0 },
    };
  }

  // Filter out already-escalated items (belt + suspenders with status gate)
  const unescalated = items.filter(
    (i) => !i.tags?.includes('auto-escalated'),
  );

  // Resolve FlashFlow project ID (feedback is product feedback)
  const { data: ffProject } = await supabaseAdmin
    .from('cc_projects')
    .select('id')
    .eq('type', 'flashflow')
    .eq('status', 'active')
    .limit(1)
    .single();

  const projectId = ffProject?.id;
  if (!projectId) {
    return {
      pass: 'feedback-enforce',
      ok: false,
      detail: { error: 'No active FlashFlow project found in cc_projects' },
    };
  }

  for (const item of unescalated) {
    const taskTitle = `[Auto] ${item.type === 'bug' ? 'Bug' : 'Support'} P${item.priority}: ${item.title}`;

    const { data: task, error: insertErr } = await supabaseAdmin
      .from('project_tasks')
      .insert({
        project_id: projectId,
        title: taskTitle.slice(0, 500),
        description: `Auto-escalated from feedback #${item.id.slice(0, 8)}\n\n${item.description || ''}`.slice(
          0,
          10000,
        ),
        assigned_agent: 'unassigned',
        status: 'queued' as const,
        priority: item.priority,
        meta: {
          source: 'feedback-enforcement',
          feedback_id: item.id,
          feedback_type: item.type,
          reporter: item.reporter_email,
        },
      })
      .select('id')
      .single();

    if (insertErr || !task) {
      errors.push(`feedback ${item.id.slice(0, 8)}: ${insertErr?.message}`);
      continue;
    }

    await logTaskEvent({
      task_id: task.id,
      agent_id: 'orchestrator',
      event_type: 'created',
      payload: {
        source: 'feedback-enforcement',
        feedback_id: item.id,
      },
    });

    // Mark feedback as triaged + tag
    const updatedTags = [...(item.tags || []), 'auto-escalated'];
    await supabaseAdmin
      .from('ff_feedback_items')
      .update({ status: 'triaged', tags: updatedTags })
      .eq('id', item.id);

    created.push(item.id.slice(0, 8));
  }

  return {
    pass: 'feedback-enforce',
    ok: errors.length === 0,
    detail: { created: created.length, errors },
  };
}

// ---------------------------------------------------------------------------
// Pass 3 — Stuck Recovery
//
// Schema reality: ff_agent_queue has no retry_count column and no 'stuck'
// status. Failed items (status='failed') are retried up to MAX_AGENT_RETRIES
// times by tracking count in payload_json.orchestrator_retries.
// ---------------------------------------------------------------------------

async function pass3_stuckRecovery(): Promise<PassReport> {
  const retried: string[] = [];
  const exhausted: string[] = [];
  const errors: string[] = [];

  const { data: failed, error: qErr } = await supabaseAdmin
    .from('ff_agent_queue')
    .select('id, payload_json, error')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(20);

  if (qErr) {
    return {
      pass: 'stuck-recovery',
      ok: false,
      detail: { error: qErr.message },
    };
  }

  if (!failed || failed.length === 0) {
    return {
      pass: 'stuck-recovery',
      ok: true,
      detail: { processed: 0 },
    };
  }

  for (const item of failed) {
    const payload = (item.payload_json || {}) as Record<string, unknown>;
    const retryCount = (payload.orchestrator_retries as number) || 0;

    if (retryCount >= MAX_AGENT_RETRIES) {
      exhausted.push(item.id.slice(0, 8));
      continue;
    }

    // Retry: reset to pending, increment retry count
    const updatedPayload = {
      ...payload,
      orchestrator_retries: retryCount + 1,
      last_retry_at: new Date().toISOString(),
      last_error: item.error,
    };

    const { error: upErr } = await supabaseAdmin
      .from('ff_agent_queue')
      .update({
        status: 'pending',
        payload_json: updatedPayload,
        error: null,
        finished_at: null,
        started_at: null,
        worker_id: null,
      })
      .eq('id', item.id);

    if (upErr) {
      errors.push(`${item.id.slice(0, 8)}: ${upErr.message}`);
      continue;
    }

    retried.push(item.id.slice(0, 8));
  }

  return {
    pass: 'stuck-recovery',
    ok: errors.length === 0,
    detail: {
      retried: retried.length,
      exhausted: exhausted.length,
      errors,
    },
  };
}

// ---------------------------------------------------------------------------
// Pass 4 — Executor Sync
//
// Checks recently completed ff_agent_queue items. If any project_task
// references them via meta.agent_queue_id, sync the status.
// Also checks project_tasks created by the orchestrator that are still
// queued/active and looks for matching completed agent work.
// ---------------------------------------------------------------------------

async function pass4_executorSync(): Promise<PassReport> {
  const synced: string[] = [];
  const errors: string[] = [];

  // Find project_tasks with a linked agent_queue_id that are still open
  const { data: openTasks, error: tErr } = await supabaseAdmin
    .from('project_tasks')
    .select('id, meta, status')
    .in('status', ['queued', 'active'])
    .not('meta->agent_queue_id', 'is', null)
    .limit(50);

  if (tErr) {
    return {
      pass: 'executor-sync',
      ok: false,
      detail: { error: tErr.message },
    };
  }

  if (!openTasks || openTasks.length === 0) {
    return {
      pass: 'executor-sync',
      ok: true,
      detail: { synced: 0 },
    };
  }

  for (const task of openTasks) {
    const meta = task.meta as Record<string, unknown>;
    const queueId = meta?.agent_queue_id as string;
    if (!queueId) continue;

    const { data: queueItem } = await supabaseAdmin
      .from('ff_agent_queue')
      .select('status, result_json, error')
      .eq('id', queueId)
      .single();

    if (!queueItem) continue;

    let newStatus: string | null = null;
    if (queueItem.status === 'done') {
      newStatus = 'done';
    } else if (queueItem.status === 'failed') {
      const payload = (queueItem as Record<string, unknown>).result_json as Record<string, unknown> | null;
      const retries = ((payload || {}) as Record<string, unknown>).orchestrator_retries as number || 0;
      if (retries >= MAX_AGENT_RETRIES) {
        newStatus = 'blocked';
      }
    }

    if (!newStatus || newStatus === task.status) continue;

    const { error: upErr } = await supabaseAdmin
      .from('project_tasks')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id);

    if (upErr) {
      errors.push(`task ${task.id.slice(0, 8)}: ${upErr.message}`);
      continue;
    }

    await logTaskEvent({
      task_id: task.id,
      agent_id: 'orchestrator',
      event_type: 'status_change',
      payload: {
        from: task.status,
        to: newStatus,
        reason: 'executor-sync',
        agent_queue_id: queueId,
      },
    });

    synced.push(task.id.slice(0, 8));
  }

  return {
    pass: 'executor-sync',
    ok: errors.length === 0,
    detail: { synced: synced.length, errors },
  };
}

// ---------------------------------------------------------------------------
// Pass 5 — Brain Writeback
//
// For completed project_tasks created by the orchestrator, append a summary
// row to the vault project worklog and mark writeback as done.
// ---------------------------------------------------------------------------

async function pass5_brainWriteback(): Promise<PassReport> {
  if (!(await vaultAccessible())) {
    return {
      pass: 'brain-writeback',
      ok: true,
      detail: { skipped: true, reason: 'vault not accessible' },
    };
  }

  const written: string[] = [];
  const errors: string[] = [];
  const vaultPath = getVaultPath();

  // Find done tasks from orchestrator sources that haven't been written back
  const { data: doneTasks, error: qErr } = await supabaseAdmin
    .from('project_tasks')
    .select('id, title, meta, assigned_agent, updated_at')
    .eq('status', 'done')
    .limit(30);

  if (qErr) {
    return {
      pass: 'brain-writeback',
      ok: false,
      detail: { error: qErr.message },
    };
  }

  if (!doneTasks || doneTasks.length === 0) {
    return {
      pass: 'brain-writeback',
      ok: true,
      detail: { written: 0 },
    };
  }

  // Filter to orchestrator-sourced tasks that haven't been written back
  const pending = doneTasks.filter((t) => {
    const meta = t.meta as Record<string, unknown>;
    const source = meta?.source as string;
    return (
      ['brain-dispatcher', 'feedback-enforcement'].includes(source) &&
      !meta?.writeback_done
    );
  });

  const today = new Date().toISOString().slice(0, 10);

  for (const task of pending) {
    const meta = task.meta as Record<string, unknown>;
    const vaultProject = (meta?.vault_project as string) || 'FlashFlow';
    const worklogRel = WORKLOG_REL[vaultProject];

    if (!worklogRel) {
      errors.push(`task ${task.id.slice(0, 8)}: no worklog path for "${vaultProject}"`);
      continue;
    }

    try {
      await appendWorklogEntry(
        join(vaultPath, worklogRel),
        today,
        `Completed: ${task.title}`,
        `mc-task: ${task.id.slice(0, 8)}`,
        '—',
        '—',
      );
    } catch (e) {
      errors.push(`task ${task.id.slice(0, 8)}: worklog write failed — ${e}`);
      continue;
    }

    // Mark writeback done in task meta
    await supabaseAdmin
      .from('project_tasks')
      .update({
        meta: { ...meta, writeback_done: true },
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id);

    written.push(task.id.slice(0, 8));
  }

  return {
    pass: 'brain-writeback',
    ok: errors.length === 0,
    detail: { written: written.length, errors },
  };
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function runOrchestrator(): Promise<OrchestratorReport> {
  const passes: PassReport[] = [];

  const runners = [
    pass1_brainDispatch,
    pass2_feedbackEnforce,
    pass3_stuckRecovery,
    pass4_executorSync,
    pass5_brainWriteback,
  ];

  for (const runner of runners) {
    try {
      const report = await runner();
      passes.push(report);
    } catch (err) {
      passes.push({
        pass: runner.name.replace('_', '-'),
        ok: false,
        detail: { fatal: String(err) },
      });
    }
  }

  return {
    passes,
    timestamp: new Date().toISOString(),
  };
}
