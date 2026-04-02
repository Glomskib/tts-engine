// @ts-nocheck
/**
 * FlashFlow Mac Mini Render Node Agent
 *
 * Persistent polling agent that runs on your Mac mini(s).
 * Polls the FlashFlow API for queued render jobs, claims them atomically,
 * runs the FFmpeg + GPT-4o pipeline, and reports results back.
 *
 * Setup:
 *   1. Copy .env.render-node to this directory (see .env.render-node.example)
 *   2. Install: npm install (or pnpm install) in scripts/render-node/
 *   3. Run: npx ts-node agent.ts
 *   4. Keep alive: pm2 start ecosystem.config.js
 *
 * Environment variables required:
 *   FLASHFLOW_API_URL      — e.g. https://yourapp.vercel.app
 *   RENDER_NODE_SECRET     — matches server RENDER_NODE_SECRET env var
 *   RENDER_NODE_ID         — unique name for this machine, e.g. "mac-mini-1"
 *   SUPABASE_URL           — your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key for storage uploads
 *   OPENAI_API_KEY         — GPT-4o Vision + Whisper
 */

import 'dotenv/config';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { runPipeline, PipelinePayload } from './pipeline';

const execFileAsync = promisify(execFile);

// ─── Config ──────────────────────────────────────────────────────────────────

const API_URL = process.env.FLASHFLOW_API_URL;
const NODE_SECRET = process.env.RENDER_NODE_SECRET;
const NODE_ID = process.env.RENDER_NODE_ID || `mac-mini-${os.hostname()}`;
const POLL_INTERVAL_MS   = 5_000;   // poll interval when idle
const HEARTBEAT_INTERVAL = 30_000;  // heartbeat every 30s
const JOB_TYPES = ['clip_render'];

if (!API_URL || !NODE_SECRET) {
  console.error('[agent] FLASHFLOW_API_URL and RENDER_NODE_SECRET are required');
  process.exit(1);
}

// ─── API Helpers ─────────────────────────────────────────────────────────────

const authHeaders = {
  'Content-Type': 'application/json',
  'x-render-node-secret': NODE_SECRET!,
};

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...authHeaders, ...(options.headers || {}) },
  });
  return res;
}

async function claimJob() {
  const res = await apiFetch('/api/render-jobs/claim', {
    method: 'POST',
    body: JSON.stringify({ node_id: NODE_ID, job_types: JOB_TYPES }),
  });

  if (res.status === 204) return null; // Empty queue
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claim failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  return json.data;
}

async function reportProgress(jobId: string, pct: number, message: string) {
  try {
    await apiFetch(`/api/render-jobs/${jobId}/progress`, {
      method: 'PATCH',
      body: JSON.stringify({ progress_pct: pct, progress_message: message, node_id: NODE_ID }),
    });
  } catch (err) {
    console.warn(`[agent] Progress report failed for ${jobId}:`, err);
  }
}

async function reportComplete(jobId: string, result: object) {
  const res = await apiFetch(`/api/render-jobs/${jobId}/complete`, {
    method: 'POST',
    body: JSON.stringify(result),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Complete report failed: ${res.status} ${text}`);
  }
}

async function reportFail(jobId: string, error: string, retry = true) {
  await apiFetch(`/api/render-jobs/${jobId}/fail`, {
    method: 'POST',
    body: JSON.stringify({ error, retry }),
  });
}

let _currentJobId: string | null = null;

async function sendHeartbeat() {
  try {
    const ffmpegVer = await execFileAsync('ffmpeg', ['-version'])
      .then(({ stdout }) => stdout.split('\n')[0].split(' ')[2] || 'unknown')
      .catch(() => 'unknown');

    await apiFetch('/api/render-jobs/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        node_id: NODE_ID,
        current_job_id: _currentJobId,
        ffmpeg_version: ffmpegVer,
        platform: `${os.platform()} ${os.arch()} (${os.cpus()[0]?.model || 'unknown CPU'})`,
      }),
    });
  } catch {
    // Non-fatal — heartbeat failures don't stop the render loop
  }
}

// ─── Main Loop ───────────────────────────────────────────────────────────────

let isProcessing = false;

async function processNextJob(): Promise<boolean> {
  const job = await claimJob();
  if (!job) return false; // Nothing queued

  isProcessing = true;
  const { id: jobId, workspace_id: userId, payload } = job;
  _currentJobId = jobId;
  console.log(`[agent] Claimed job ${jobId} for workspace ${userId}`);

  const progressCallback = async (pct: number, message: string) => {
    console.log(`[agent] [${jobId}] ${pct}% — ${message}`);
    await reportProgress(jobId, pct, message);
  };

  try {
    const result = await runPipeline(
      jobId,
      userId,
      payload as PipelinePayload,
      progressCallback
    );

    console.log(`[agent] Job ${jobId} complete — ${result.final_video_url}`);
    await reportComplete(jobId, result);
  } catch (err: any) {
    console.error(`[agent] Job ${jobId} failed:`, err);
    await reportFail(jobId, err?.message || String(err));
  } finally {
    isProcessing = false;
    _currentJobId = null;
  }

  return true;
}

async function main() {
  console.log(`[agent] FlashFlow Render Node starting — ID: ${NODE_ID}`);
  console.log(`[agent] API: ${API_URL}`);
  console.log(`[agent] Polling every ${POLL_INTERVAL_MS}ms`);

  // Send initial heartbeat and schedule recurring ones
  await sendHeartbeat();
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

  let consecutive_empty = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const didWork = await processNextJob();

      if (didWork) {
        consecutive_empty = 0;
      } else {
        consecutive_empty++;
        // Back off a bit when consistently idle (max 30s)
        const delay = Math.min(POLL_INTERVAL_MS * Math.ceil(consecutive_empty / 5), 30_000);
        if (consecutive_empty % 12 === 0) {
          console.log(`[agent] Queue empty — next poll in ${delay}ms`);
        }
        await sleep(delay);
      }
    } catch (err: any) {
      console.error('[agent] Unexpected error in main loop:', err);
      await sleep(10_000); // Back off on unexpected errors
    }
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('[agent] Fatal error:', err);
  process.exit(1);
});
