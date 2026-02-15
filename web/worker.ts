#!/usr/bin/env node
/**
 * Claude Code Task Queue Worker
 * 
 * Polls Supabase task_queue table and dispatches work to Claude Code CLI.
 * Each terminal runs this daemon with TERMINAL_ID env var (T1-T8).
 * 
 * Usage:
 *   export TERMINAL_ID=T1
 *   cd /Volumes/WorkSSD/01_ACTIVE/FlashFlow/web
 *   node worker.ts
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

// Config
const SUPABASE_URL = 'https://qqyrwwvtxzrwbyqegpme.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxeXJ3d3Z0eHpyd2J5cWVncG1lIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODc4MDI0MiwiZXhwIjoyMDg0MzU2MjQyfQ.kV8aS-K0W49heqLgxvKUroXx6OVvX7jMgEFyPzdPh3k';

const TERMINAL_ID = process.env.TERMINAL_ID || `T${Math.floor(Math.random() * 8) + 1}`;
const REPO_PATH = '/Volumes/WorkSSD/01_ACTIVE/FlashFlow';
const POLL_INTERVAL = 5000;  // 5 seconds

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============================================================================
// TASK POLLING & CLAIMING
// ============================================================================

async function claimTask() {
  console.log(`\n⏱️  [${TERMINAL_ID}] Polling task_queue...`);
  
  const { data: tasks, error } = await supabase
    .from('task_queue')
    .select('*')
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .limit(10);  // Get more tasks to filter by dependencies

  if (error) {
    console.error(`❌ [${TERMINAL_ID}] Query error:`, error.message);
    return null;
  }

  if (!tasks || tasks.length === 0) {
    console.log(`⏳ [${TERMINAL_ID}] No pending tasks. Waiting...`);
    return null;
  }

  // Find first task whose dependency (if any) is completed
  for (const task of tasks) {
    // If task has a dependency, check if it's completed
    if (task.depends_on) {
      const { data: depTask, error: depError } = await supabase
        .from('task_queue')
        .select('status')
        .eq('id', task.depends_on)
        .single();

      if (depError || !depTask || depTask.status !== 'completed') {
        console.log(`⏳ [${TERMINAL_ID}] Task "${task.task_name}" waiting for dependency...`);
        continue;  // Skip this task, try the next one
      }
    }

    // Task is ready to claim (no dependency or dependency is completed)
    console.log(`📋 [${TERMINAL_ID}] Found task: ${task.task_name} (priority: ${task.priority})`);

    // Claim the task
    const { error: updateError } = await supabase
      .from('task_queue')
      .update({
        status: 'claimed',
        assigned_terminal: TERMINAL_ID,
        claimed_at: new Date().toISOString(),
      })
      .eq('id', task.id);

    if (updateError) {
      console.error(`❌ [${TERMINAL_ID}] Failed to claim task:`, updateError.message);
      continue;  // Try next task
    }

    return task;
  }

  console.log(`⏳ [${TERMINAL_ID}] All pending tasks have unmet dependencies. Waiting...`);
  return null;
}

// ============================================================================
// CLAUDE CODE PROMPT DISPATCH
// ============================================================================

async function executeTask(task: any): Promise<boolean> {
  console.log(`🚀 [${TERMINAL_ID}] Starting: ${task.task_name}`);
  
  // Mark as in_progress
  await supabase
    .from('task_queue')
    .update({
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    .eq('id', task.id);

  try {
    const { prompt_text } = task;
    
    // Dispatch to Claude Code
    console.log(`📝 [${TERMINAL_ID}] Piping prompt to claude -p --model sonnet --dangerously-skip-permissions...`);
    const claudeOutput = await runClaudeCode(prompt_text);
    
    // Get latest commit
    const latestCommit = await getLatestCommit();
    
    console.log(`✅ [${TERMINAL_ID}] Completed: ${task.task_name}`);
    console.log(`📌 Commit: ${latestCommit}`);
    
    // Update task_queue with success
    const { error: updateError } = await supabase
      .from('task_queue')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result: {
          commit: latestCommit,
          output: claudeOutput.substring(0, 1000),  // First 1000 chars
          success: true,
        },
      })
      .eq('id', task.id);

    if (updateError) {
      console.error(`❌ [${TERMINAL_ID}] Failed to update task result:`, updateError.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`❌ [${TERMINAL_ID}] Execution failed:`, error);
    
    // Mark task as failed
    const { error: failError } = await supabase
      .from('task_queue')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        result: {
          error: String(error),
          success: false,
        },
      })
      .eq('id', task.id);

    if (failError) {
      console.error(`❌ [${TERMINAL_ID}] Failed to mark task as failed:`, failError.message);
    }

    return false;
  }
}

// ============================================================================
// CLAUDE CODE EXECUTION
// ============================================================================

function runClaudeCode(promptText: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    // Write prompt to a temp file to avoid shell escaping issues
    const tmpFile = path.join('/tmp', `claude-prompt-${TERMINAL_ID}-${Date.now()}.txt`);
    await fs.writeFile(tmpFile, promptText, 'utf-8');

    // Command: cd to repo and pipe temp file to `claude -p --model sonnet --dangerously-skip-permissions`
    const cmd = `cd ${REPO_PATH}/web && cat "${tmpFile}" | claude -p --model sonnet --dangerously-skip-permissions`;

    console.log(`🔷 [${TERMINAL_ID}] Running: claude -p --model sonnet --dangerously-skip-permissions (headless mode)`);

    const proc = spawn('sh', ['-c', cmd], {
      cwd: REPO_PATH,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CLAUDECODE: undefined },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(`[${TERMINAL_ID}] ${chunk}`);
    });

    proc.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(`[${TERMINAL_ID}] ERROR: ${chunk}`);
    });

    proc.on('close', async (code) => {
      // Clean up temp file
      await fs.unlink(tmpFile).catch(() => {});
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Claude Code exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', async (err) => {
      await fs.unlink(tmpFile).catch(() => {});
      reject(new Error(`Failed to spawn Claude Code: ${err.message}`));
    });
  });
}

async function getLatestCommit(): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', ['log', '--oneline', '-1'], {
      cwd: `${REPO_PATH}/web`,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';
    proc.stdout?.on('data', (chunk) => {
      output += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const match = output.match(/^([a-f0-9]+)/);
        resolve(match ? match[1] : 'unknown');
      } else {
        reject(new Error(`git log failed with code ${code}`));
      }
    });
  });
}

// ============================================================================
// MAIN POLL LOOP
// ============================================================================

async function pollQueue() {
  const task = await claimTask();
  if (task) {
    await executeTask(task);
  }
}

async function main() {
  console.log(`\n🔷 ═══════════════════════════════════════════════════════`);
  console.log(`🔷 Claude Code Task Queue Worker`);
  console.log(`🔷 Terminal: ${TERMINAL_ID}`);
  console.log(`🔷 Repo: ${REPO_PATH}/web`);
  console.log(`🔷 Poll Interval: ${POLL_INTERVAL}ms`);
  console.log(`🔷 ═══════════════════════════════════════════════════════\n`);

  // Initial poll
  await pollQueue();

  // Continuous polling
  setInterval(pollQueue, POLL_INTERVAL);
}

main().catch((err) => {
  console.error(`\n❌ FATAL ERROR [${TERMINAL_ID}]:`, err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n\n👋 [${TERMINAL_ID}] Shutting down gracefully...`);
  process.exit(0);
});
