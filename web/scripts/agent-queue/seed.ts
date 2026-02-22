#!/usr/bin/env tsx
/**
 * Agent Queue seed script — exercises the full lifecycle.
 *
 * Usage:
 *   npx tsx scripts/agent-queue/seed.ts
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// ── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const envPath = join(process.cwd(), '.env.local');
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
  } catch {
    // .env.local not found — rely on environment
  }
}

loadEnv();

// ── Imports (after env loaded) ───────────────────────────────────────────────
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  enqueueAgentTask,
  claimNextTask,
  markRunning,
  completeTask,
  failTask,
} from '@/lib/flashflow/agent-queue';
import type { AgentQueueRow } from '@/lib/flashflow/agent-queue';

function printTask(label: string, task: AgentQueueRow | null) {
  if (!task) {
    console.log(`  ${label}: null`);
    return;
  }
  console.log(
    `  ${label}: id=${task.id.slice(0, 8)}… ` +
      `type=${task.task_type} status=${task.status} ` +
      `priority=${task.priority} worker=${task.worker_id ?? 'none'}`,
  );
}

async function main() {
  console.log('\n=== Agent Queue Seed ===\n');

  // Step 1: Create a fake issue
  console.log('1) Creating fake issue…');
  const { data: issue, error: issueErr } = await supabaseAdmin
    .from('ff_issue_reports')
    .insert({
      source: 'manual',
      message_text: `[seed] Agent queue test — ${Date.now()}`,
      severity: 'medium',
      fingerprint: `seed-agent-queue-${Date.now()}`,
    })
    .select()
    .single();

  if (issueErr || !issue) {
    console.error('Failed to create issue:', issueErr?.message);
    process.exit(1);
  }
  console.log(`  issue_id=${issue.id}`);

  // Step 2: Enqueue two tasks
  console.log('\n2) Enqueuing tasks…');
  const task1 = await enqueueAgentTask(
    issue.id,
    'bug_fix',
    { claude_code_prompt: 'Fix the null pointer in utils.ts', files: ['lib/utils.ts'] },
    100, // critical
  );
  printTask('bug_fix (critical)', task1);

  const task2 = await enqueueAgentTask(
    issue.id,
    'investigation',
    { claude_code_prompt: 'Investigate flaky test in pipeline.test.ts' },
    500, // medium
  );
  printTask('investigation (medium)', task2);

  if (!task1 || !task2) {
    console.error('Failed to enqueue tasks');
    process.exit(1);
  }

  // Step 3: Claim — should get the priority=100 task first
  console.log('\n3) Claiming tasks…');
  const claimed1 = await claimNextTask('seed-worker-1');
  printTask('seed-worker-1 claimed', claimed1);

  const claimed2 = await claimNextTask('seed-worker-2');
  printTask('seed-worker-2 claimed', claimed2);

  if (!claimed1 || !claimed2) {
    console.error('Claim returned null — check RPC function');
    process.exit(1);
  }

  // Step 4: Mark first as running, then done; mark second as failed
  console.log('\n4) Running lifecycle…');
  const running1 = await markRunning(claimed1.id);
  printTask('task1 running', running1);

  const done1 = await completeTask(claimed1.id, {
    pr_url: 'https://github.com/example/repo/pull/42',
    summary: 'Fixed null pointer',
  });
  printTask('task1 done', done1);

  const running2 = await markRunning(claimed2.id);
  printTask('task2 running', running2);

  const failed2 = await failTask(claimed2.id, 'Investigation inconclusive — needs human review');
  printTask('task2 failed', failed2);

  // Step 5: Print final state
  console.log('\n5) Final state:');
  const { data: final } = await supabaseAdmin
    .from('ff_agent_queue')
    .select('*')
    .eq('issue_id', issue.id)
    .order('priority', { ascending: true });

  for (const row of final ?? []) {
    printTask(`  →`, row as AgentQueueRow);
  }

  console.log('\n=== Seed complete ===\n');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
