#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * Preflight Selector — runs nightly-selector then verifies queue
 *
 * Flow:
 *   1. Run tiktok:selector (spawns as child process)
 *   2. Verify queue length > 0
 *   3. Log pipeline_added event
 *   4. Exit cleanly
 *
 * Designed to run before nightly-draft in the cron chain.
 *
 * Exit codes:
 *   0  = queue has videos ready
 *   1  = selector failed or queue still empty
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { execFile } from 'child_process';
import { createClient } from '@supabase/supabase-js';

const TAG = '[preflight-selector]';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(`${TAG} SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Run tiktok:selector ────────────────────────────────────────────────────

function runSelector(): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const scriptPath = 'scripts/tiktok-studio/nightly-selector.ts';

    execFile('npx', ['tsx', scriptPath], {
      cwd: process.cwd(),
      timeout: 10 * 60 * 1000, // 10 minute timeout (pipeline calls can be slow)
      env: { ...process.env },
    }, (error, stdout, stderr) => {
      let exitCode = 0;
      if (error) {
        exitCode = typeof error.code === 'number' ? error.code : 1;
      }
      resolve({ exitCode, stdout, stderr });
    });
  });
}

// ─── Count queued videos ────────────────────────────────────────────────────

async function countQueued(): Promise<number> {
  const cutoff = new Date(Date.now() - 48 * 3_600_000).toISOString();

  const { count, error } = await supabase
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .in('recording_status', ['AI_RENDERING', 'READY_TO_POST'])
    .in('status', ['ready_to_post', 'needs_edit'])
    .gte('created_at', cutoff);

  if (error) {
    throw new Error(`Queue count error: ${error.message}`);
  }

  return count || 0;
}

// ─── Get product names from recent selector videos ──────────────────────────

async function getRecentProductNames(): Promise<string[]> {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // last hour

  const { data, error } = await supabase
    .from('videos')
    .select('product_id, products(name)')
    .in('recording_status', ['AI_RENDERING', 'READY_TO_POST'])
    .gte('created_at', cutoff)
    .limit(10);

  if (error || !data) return [];

  return data
    .map((v: any) => v.products?.name)
    .filter(Boolean)
    .map((name: string) => name.toLowerCase().replace(/\s+/g, '_'));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`${TAG} Starting preflight...`);

  // Step 1: Run tiktok:selector
  console.log(`${TAG} Running nightly-selector...`);
  const result = await runSelector();

  // Print selector output (last 20 lines)
  if (result.stdout) {
    const lines = result.stdout.trim().split('\n');
    const tail = lines.slice(-20);
    if (lines.length > 20) console.log(`${TAG} ... (${lines.length - 20} lines truncated)`);
    for (const line of tail) {
      console.log(`${TAG} | ${line}`);
    }
  }

  if (result.exitCode !== 0) {
    console.error(`${TAG} Selector exited with code ${result.exitCode}`);
    if (result.stderr) {
      const stderrTail = result.stderr.trim().split('\n').slice(-5);
      for (const line of stderrTail) {
        console.error(`${TAG} ERR: ${line}`);
      }
    }
  }

  // Step 2: Verify queue length > 0
  const queued = await countQueued();
  console.log(`${TAG} Queue length: ${queued}`);

  // Step 3: Log pipeline_added event
  const products = await getRecentProductNames();

  // Parse how many were selected from selector output
  const selectedMatch = result.stdout?.match(/Enqueued:\s+(\d+)/);
  const selectedCount = selectedMatch ? parseInt(selectedMatch[1], 10) : 0;

  const summary = {
    selected: selectedCount,
    queued,
    products,
  };

  console.log(`${TAG} ${JSON.stringify(summary)}`);

  if (queued > 0) {
    console.log(`${TAG} Preflight complete — queue has ${queued} video(s).`);
    process.exit(0);
  } else {
    console.error(`${TAG} Queue is empty after selector run.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`${TAG} Fatal error:`, err);
  process.exit(1);
});
