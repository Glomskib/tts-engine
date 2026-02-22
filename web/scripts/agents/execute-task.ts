#!/usr/bin/env tsx
/**
 * Agent task executor – claims the next available task, builds or
 * parses its execution plan, runs the mapped CLI commands, and
 * updates the task status to done (success) or rejected (failure).
 *
 * Usage:
 *   pnpm run agent:execute
 *   pnpm run agent:execute -- --worker-id my-worker
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { hostname } from 'os';

// ── Types ───────────────────────────────────────────────────────────

type TaskType = 'bug_fix' | 'feature' | 'research' | 'content';

interface AgentTask {
  id: string;
  type: TaskType;
  title: string;
  prompt: string;
  status: string;
  result: string | null;
}

interface ExecutionPlan {
  task_id: string;
  task_type: TaskType;
  task_title: string;
  generated_at: string;
  files_to_inspect: string[];
  commands_to_run: string[];
  expected_outputs: string[];
  reasoning: string;
}

interface CommandResult {
  command: string;
  exit_code: number;
  stdout: string;
  stderr: string;
}

interface ExecutionResult {
  task_id: string;
  worker_id: string;
  started_at: string;
  finished_at: string;
  success: boolean;
  plan: ExecutionPlan;
  command_results: CommandResult[];
  error?: string;
}

const PREFIX = '[execute-task]';
const CMD_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 4096;

// ── Stop words (shared with run-agent-task) ─────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'to', 'of', 'in',
  'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'out',
  'off', 'over', 'under', 'again', 'further', 'then', 'once', 'that',
  'this', 'these', 'those', 'it', 'its', 'and', 'but', 'or', 'nor',
  'not', 'so', 'if', 'when', 'what', 'which', 'who', 'whom', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very',
  'just', 'about', 'up', 'down', 'here', 'there', 'where', 'why',
  'any', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she',
  'they', 'them', 'fix', 'add', 'update', 'change', 'make', 'get',
]);

// ── Helpers ─────────────────────────────────────────────────────────

function extractKeywords(prompt: string): string[] {
  const tokens = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
  return [...new Set(tokens)].slice(0, 5);
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + `\n...[truncated at ${max} bytes]`;
}

// ── Plan generation (mirrors run-agent-task logic) ──────────────────

function buildPlan(task: AgentTask): ExecutionPlan {
  const keywords = extractKeywords(task.prompt);
  const kwPaths = keywords.map((kw) => `*${kw}*`);
  const kwGrepPattern = keywords.join('|');

  const builders: Record<
    TaskType,
    () => Pick<ExecutionPlan, 'files_to_inspect' | 'commands_to_run' | 'expected_outputs' | 'reasoning'>
  > = {
    bug_fix: () => ({
      files_to_inspect: ['logs/', 'app/api/', 'lib/', ...kwPaths],
      commands_to_run: [
        `grep -r "error\\|Error\\|ERROR" logs/ --include="*.log" -l`,
        `grep -rn "${kwGrepPattern}" app/ lib/ --include="*.ts" --include="*.tsx" -l`,
        'pnpm run type-check',
        'pnpm run lint',
      ],
      expected_outputs: [
        'Log files containing errors',
        'Source locations matching keywords',
        'Type-check results (pass/fail)',
        'Lint results (pass/fail)',
      ],
      reasoning: `Bug fix task: inspect error logs and grep for keywords [${keywords.join(', ')}] in app/api and lib directories, then validate with type-check and lint.`,
    }),
    feature: () => ({
      files_to_inspect: ['app/', 'components/', 'lib/', ...kwPaths],
      commands_to_run: [
        `find app/ components/ -name "*.tsx" -type f | head -50`,
        `grep -rn "${kwGrepPattern}" app/ components/ lib/ --include="*.ts" --include="*.tsx" -l`,
        `grep -A2 '"dependencies"' package.json`,
      ],
      expected_outputs: [
        'Related component files',
        'Domain files matching keywords',
        'Current dependency versions',
      ],
      reasoning: `Feature task: identify related components and domain files for keywords [${keywords.join(', ')}], review existing patterns and dependencies.`,
    }),
    research: () => ({
      files_to_inspect: ['docs/', 'README.md', 'supabase/migrations/', ...kwPaths],
      commands_to_run: [
        `grep -rn "${kwGrepPattern}" docs/ supabase/migrations/ --include="*.md" --include="*.sql" -l`,
        `find docs/ -name "*.md" -type f`,
      ],
      expected_outputs: [
        'Documentation and schema references matching keywords',
        'Full documentation file listing',
      ],
      reasoning: `Research task: search documentation and migration files for keywords [${keywords.join(', ')}] to gather context and references.`,
    }),
    content: () => ({
      files_to_inspect: ['prompts/', 'scripts/daily-intel/', 'scripts/autopilot/', ...kwPaths],
      commands_to_run: [
        'ls prompts/',
        `grep -rn "${kwGrepPattern}" scripts/daily-intel/ scripts/autopilot/ --include="*.ts" -l`,
        `find prompts/ scripts/daily-intel/ scripts/autopilot/ -name "*.ts" -o -name "*.md" | head -30`,
      ],
      expected_outputs: [
        'Available prompt templates',
        'Content scripts matching keywords',
        'Reference content files',
      ],
      reasoning: `Content task: list prompt templates and search content scripts for keywords [${keywords.join(', ')}] to find related templates and patterns.`,
    }),
  };

  const parts = builders[task.type]();
  return {
    task_id: task.id,
    task_type: task.type,
    task_title: task.title,
    generated_at: new Date().toISOString(),
    ...parts,
  };
}

// ── Claim next task ─────────────────────────────────────────────────

async function claimNextAgentTask(
  supabase: SupabaseClient,
  workerId: string,
): Promise<AgentTask | null> {
  // Find the highest-priority pending/approved task
  const { data: task, error } = await supabase
    .from('agent_tasks')
    .select('id, type, title, prompt, status, result')
    .in('status', ['pending', 'approved'])
    .order('priority', { ascending: true })   // critical < high < medium < low
    .order('created_at', { ascending: true }) // oldest first
    .limit(1)
    .single();

  if (error || !task) {
    return null;
  }

  // Claim it by setting status to in_progress
  const { error: claimErr } = await supabase
    .from('agent_tasks')
    .update({ status: 'in_progress' })
    .eq('id', task.id)
    .eq('status', task.status); // optimistic lock

  if (claimErr) {
    console.error(`${PREFIX} Failed to claim task ${task.id}: ${claimErr.message}`);
    return null;
  }

  console.log(`${PREFIX} Claimed task ${task.id} (worker: ${workerId})`);
  return task as AgentTask;
}

// ── Execute plan commands ───────────────────────────────────────────

function executePlan(plan: ExecutionPlan): CommandResult[] {
  const results: CommandResult[] = [];

  for (const cmd of plan.commands_to_run) {
    console.log(`${PREFIX}   $ ${cmd}`);
    try {
      const stdout = execSync(cmd, {
        timeout: CMD_TIMEOUT_MS,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });
      results.push({
        command: cmd,
        exit_code: 0,
        stdout: truncate(stdout ?? '', MAX_OUTPUT_BYTES),
        stderr: '',
      });
    } catch (err: any) {
      // execSync throws on non-zero exit — capture output anyway
      results.push({
        command: cmd,
        exit_code: err.status ?? 1,
        stdout: truncate(err.stdout ?? '', MAX_OUTPUT_BYTES),
        stderr: truncate(err.stderr ?? '', MAX_OUTPUT_BYTES),
      });
    }
  }

  return results;
}

// ── CLI arg parsing ─────────────────────────────────────────────────

function parseArgs(): { workerId: string } {
  const args = process.argv.slice(2);

  const widx = args.indexOf('--worker-id');
  const workerId =
    widx !== -1 && args[widx + 1]
      ? args[widx + 1]
      : `${hostname()}-${process.pid}`;

  return { workerId };
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const { workerId } = parseArgs();

  console.log(`${PREFIX} Starting at ${new Date().toISOString()}`);
  console.log(`${PREFIX} Worker: ${workerId}`);

  // Validate env
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error(`${PREFIX} ERROR: NEXT_PUBLIC_SUPABASE_URL not set`);
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`${PREFIX} ERROR: SUPABASE_SERVICE_ROLE_KEY not set`);
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // 1. Claim next task
  const task = await claimNextAgentTask(supabase, workerId);
  if (!task) {
    console.log(`${PREFIX} No pending/approved tasks in queue`);
    return;
  }

  console.log(`${PREFIX} Task: "${task.title}" (${task.type})`);
  const startedAt = new Date().toISOString();

  // 2. Parse existing plan or build a fresh one
  let plan: ExecutionPlan;
  if (task.result) {
    try {
      plan = JSON.parse(task.result) as ExecutionPlan;
      console.log(`${PREFIX} Using existing plan from result column`);
    } catch {
      console.log(`${PREFIX} Invalid plan JSON in result — generating fresh plan`);
      plan = buildPlan(task);
    }
  } else {
    console.log(`${PREFIX} No existing plan — generating fresh plan`);
    plan = buildPlan(task);
  }

  console.log(`${PREFIX} Running ${plan.commands_to_run.length} commands...`);

  // 3. Run mapped CLI commands
  const commandResults = executePlan(plan);

  const allPassed = commandResults.every((r) => r.exit_code === 0);
  const finishedAt = new Date().toISOString();

  const executionResult: ExecutionResult = {
    task_id: task.id,
    worker_id: workerId,
    started_at: startedAt,
    finished_at: finishedAt,
    success: allPassed,
    plan,
    command_results: commandResults,
  };

  if (!allPassed) {
    const failedCmds = commandResults.filter((r) => r.exit_code !== 0);
    executionResult.error = `${failedCmds.length}/${commandResults.length} commands failed`;
  }

  // 4. Update status: done or rejected (schema has no 'failed')
  const finalStatus = allPassed ? 'done' : 'rejected';

  const { error: updateErr } = await supabase
    .from('agent_tasks')
    .update({ status: finalStatus, result: JSON.stringify(executionResult) })
    .eq('id', task.id);

  if (updateErr) {
    console.error(`${PREFIX} ERROR: Failed to update status: ${updateErr.message}`);
    // Attempt rollback to approved so the task isn't stuck in_progress
    const { error: rbErr } = await supabase
      .from('agent_tasks')
      .update({ status: 'approved' })
      .eq('id', task.id);
    if (rbErr) {
      console.error(`${PREFIX} ERROR: Rollback also failed: ${rbErr.message}`);
    } else {
      console.log(`${PREFIX} Rolled back status to "approved"`);
    }
    return;
  }

  console.log(`${PREFIX} Status → ${finalStatus}`);
  console.log(`${PREFIX} Result stored (${JSON.stringify(executionResult).length} bytes)`);
  console.log(`${PREFIX} Finished at ${finishedAt}`);
}

main().catch((err) => {
  console.error(`${PREFIX} FATAL:`, err);
  // never crash process — exit cleanly
});
