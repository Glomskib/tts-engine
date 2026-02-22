#!/usr/bin/env tsx
/**
 * Executor stub – reads an agent_tasks row, generates a deterministic
 * execution plan, and stores it back as JSON in the result column.
 *
 * Usage:
 *   pnpm run agent:run-task -- --task <uuid>
 *   pnpm run agent:run-task -- --task <uuid> --dry-run
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

// ── Types ───────────────────────────────────────────────────────────

type TaskType = 'bug_fix' | 'feature' | 'research' | 'content';

interface AgentTask {
  id: string;
  type: TaskType;
  title: string;
  prompt: string;
  status: string;
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

// ── Stop words for keyword extraction ───────────────────────────────

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

// ── Keyword extraction ──────────────────────────────────────────────

function extractKeywords(prompt: string): string[] {
  const tokens = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));

  const unique = [...new Set(tokens)];
  return unique.slice(0, 5);
}

// ── Plan generation (pure, deterministic) ───────────────────────────

function generatePlan(task: AgentTask): ExecutionPlan {
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

  const builder = builders[task.type];
  const parts = builder();

  return {
    task_id: task.id,
    task_type: task.type,
    task_title: task.title,
    generated_at: new Date().toISOString(),
    ...parts,
  };
}

// ── CLI arg parsing ─────────────────────────────────────────────────

function parseArgs(): { taskId: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const taskIdx = args.indexOf('--task');
  if (taskIdx === -1 || !args[taskIdx + 1]) {
    console.error('[run-agent-task] ERROR: --task <uuid> is required');
    process.exit(1);
  }
  const taskId = args[taskIdx + 1];

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(taskId)) {
    console.error(`[run-agent-task] ERROR: Invalid UUID format: ${taskId}`);
    process.exit(1);
  }

  return { taskId, dryRun };
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const { taskId, dryRun } = parseArgs();
  const prefix = '[run-agent-task]';

  console.log(`${prefix} Starting at ${new Date().toISOString()}`);
  console.log(`${prefix} Task ID: ${taskId}`);
  console.log(`${prefix} Dry run: ${dryRun}`);

  // Validate env
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error(`${prefix} ERROR: NEXT_PUBLIC_SUPABASE_URL not set`);
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`${prefix} ERROR: SUPABASE_SERVICE_ROLE_KEY not set`);
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // Fetch task
  const { data: task, error: fetchErr } = await supabase
    .from('agent_tasks')
    .select('id, type, title, prompt, status')
    .eq('id', taskId)
    .single();

  if (fetchErr || !task) {
    console.error(`${prefix} ERROR: Task not found: ${fetchErr?.message ?? 'no data'}`);
    process.exit(1);
  }

  if (task.status !== 'pending' && task.status !== 'approved') {
    console.error(`${prefix} ERROR: Task status is "${task.status}" — expected "pending" or "approved"`);
    process.exit(1);
  }

  console.log(`${prefix} Task: "${task.title}" (${task.type}, ${task.status})`);

  // Mark in_progress (unless dry-run)
  if (!dryRun) {
    const { error: ipErr } = await supabase
      .from('agent_tasks')
      .update({ status: 'in_progress' })
      .eq('id', taskId);

    if (ipErr) {
      console.error(`${prefix} ERROR: Failed to mark in_progress: ${ipErr.message}`);
      process.exit(1);
    }
    console.log(`${prefix} Status → in_progress`);
  }

  // Generate plan
  const plan = generatePlan(task as AgentTask);

  // Dry-run: print and exit
  if (dryRun) {
    console.log(`\n${prefix} Execution Plan (dry-run):\n`);
    console.log(JSON.stringify(plan, null, 2));
    process.exit(0);
  }

  // Persist plan
  const { error: doneErr } = await supabase
    .from('agent_tasks')
    .update({ status: 'done', result: JSON.stringify(plan) })
    .eq('id', taskId);

  if (doneErr) {
    console.error(`${prefix} ERROR: Failed to mark done: ${doneErr.message}`);
    // Rollback to approved
    const { error: rbErr } = await supabase
      .from('agent_tasks')
      .update({ status: 'approved' })
      .eq('id', taskId);
    if (rbErr) {
      console.error(`${prefix} ERROR: Rollback also failed: ${rbErr.message}`);
    } else {
      console.log(`${prefix} Rolled back status to "approved"`);
    }
    process.exit(1);
  }

  console.log(`${prefix} Status → done`);
  console.log(`${prefix} Plan stored in result column (${JSON.stringify(plan).length} bytes)`);
  console.log(`${prefix} Finished at ${new Date().toISOString()}`);
}

main().catch((err) => {
  console.error('[run-agent-task] FATAL:', err);
  process.exit(1);
});
