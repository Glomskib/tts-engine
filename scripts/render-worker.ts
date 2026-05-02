/**
 * FlashFlow editor render-worker.
 *
 * Long-running Node process that polls `render_jobs WHERE status='queued' AND
 * job_type='editor_pipeline'`, claims a row via `claim_render_job` (atomic via
 * FOR UPDATE SKIP LOCKED), runs ffmpeg locally with the args from the row,
 * uploads the output to Supabase storage, and marks the row 'completed'.
 *
 * Designed to run on the Mac mini under launchd (com.flashflow.render-worker).
 * Outbound network only — no inbound ports needed.
 *
 * Behavior:
 *   - SIGTERM/SIGINT → finish current job, then exit cleanly
 *   - On ffmpeg failure: requeue if attempts remaining, else mark 'failed'
 *   - Stale-row watchdog: any 'claimed' or 'processing' row older than 10
 *     minutes (queried via reset_stale_render_jobs_10min) gets requeued so
 *     a different worker can pick it up. Watchdog runs every 2 minutes.
 *   - Logs to stdout AND to a rotating file at LOG_DIR (default /tmp/render-worker.log)
 *
 * Env:
 *   SUPABASE_URL                   (required)
 *   SUPABASE_SERVICE_ROLE_KEY      (required)
 *   RENDER_WORKER_NAME             (default: 'render-worker-<hostname>')
 *   RENDER_WORKER_POLL_INTERVAL_MS (default: 3000)
 *   RENDER_WORKER_BUCKET           (default: 'edit-jobs')
 *   RENDER_WORKER_LOG_DIR          (default: ~/Library/Logs/FlashFlow)
 *   RENDER_WORKER_TMP_DIR          (default: os.tmpdir/flashflow-render-worker)
 *   RENDER_WORKER_MAX_INFLIGHT     (default: 1 — single concurrency on mini)
 *
 * Run:
 *   npx tsx scripts/render-worker.ts
 *   (or, after build: node dist/scripts/render-worker.js)
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { promises as fs, createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath: string = require('ffmpeg-static');

// ── Config ────────────────────────────────────────────────────────────────

function required(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`[render-worker] missing env var ${name}`); process.exit(1); }
  return v;
}

const SUPABASE_URL = required('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY');
const WORKER_NAME = process.env.RENDER_WORKER_NAME || `render-worker-${os.hostname()}`;
const POLL_INTERVAL_MS = Number(process.env.RENDER_WORKER_POLL_INTERVAL_MS || 3000);
const BUCKET = process.env.RENDER_WORKER_BUCKET || 'edit-jobs';
const LOG_DIR = process.env.RENDER_WORKER_LOG_DIR ||
  path.join(os.homedir(), 'Library', 'Logs', 'FlashFlow');
const TMP_DIR = process.env.RENDER_WORKER_TMP_DIR ||
  path.join(os.tmpdir(), 'flashflow-render-worker');

// ── Logging — stdout + rotating file ──────────────────────────────────────

let logStream: ReturnType<typeof createWriteStream> | null = null;
async function initLogger() {
  await fs.mkdir(LOG_DIR, { recursive: true }).catch(() => {});
  const logFile = path.join(LOG_DIR, 'render-worker.log');
  // Rotate if file is over 5 MB (keep last as .1)
  try {
    const st = await fs.stat(logFile);
    if (st.size > 5 * 1024 * 1024) {
      await fs.rename(logFile, logFile + '.1').catch(() => {});
    }
  } catch { /* file doesn't exist yet */ }
  logStream = createWriteStream(logFile, { flags: 'a' });
}

function log(...args: unknown[]) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${WORKER_NAME}] ${args.map((a) => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}`;
  console.log(line);
  if (logStream) logStream.write(line + '\n');
}

// ── State ─────────────────────────────────────────────────────────────────

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let stopping = false;
process.on('SIGINT', () => { stopping = true; log('SIGINT received — finishing current job then exiting'); });
process.on('SIGTERM', () => { stopping = true; log('SIGTERM received — finishing current job then exiting'); });

// ── Job claim + execute ───────────────────────────────────────────────────

interface RenderJobPayload {
  edit_job_id?: string;
  ffmpeg_args: string[];
  input_paths: string[];   // storage paths to download
  output_path: string;     // storage path for the output
}

interface RenderJobRow {
  id: string;
  job_type: string;
  status: string;
  payload: RenderJobPayload;
  retry_count: number;
  max_retries: number;
}

async function claimNextJob(): Promise<RenderJobRow | null> {
  const { data, error } = await supabase.rpc('claim_render_job', {
    p_node_id: WORKER_NAME,
    p_job_types: ['editor_pipeline'],
  });
  if (error) {
    log('claim error:', error.message);
    return null;
  }
  if (!data || (Array.isArray(data) && data.length === 0)) return null;
  const row = (Array.isArray(data) ? data[0] : data) as RenderJobRow;
  return row;
}

async function downloadFromStorage(storagePath: string, dest: string): Promise<void> {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) throw new Error(`Download failed for ${storagePath}: ${error?.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(dest, buf);
}

async function uploadToStorage(storagePath: string, localFile: string, contentType = 'video/mp4'): Promise<string> {
  const data = await fs.readFile(localFile);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, data, {
    contentType, upsert: true,
  });
  if (error) throw new Error(`Upload failed for ${storagePath}: ${error.message}`);
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return urlData.publicUrl;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}

async function processJob(job: RenderJobRow): Promise<void> {
  log(`claimed job ${job.id} (attempts ${job.retry_count}/${job.max_retries})`);

  // Mark started
  await supabase.from('render_jobs').update({
    status: 'processing',
    started_at: new Date().toISOString(),
    progress_message: `started by ${WORKER_NAME}`,
  }).eq('id', job.id);

  const payload = job.payload || {} as RenderJobPayload;
  if (!Array.isArray(payload.ffmpeg_args) || payload.ffmpeg_args.length === 0) {
    throw new Error('payload.ffmpeg_args missing or empty');
  }
  if (!payload.output_path) {
    throw new Error('payload.output_path missing');
  }

  const workDir = await fs.mkdtemp(path.join(TMP_DIR, `job-${job.id}-`));
  try {
    // 1. Download inputs
    const localInputs: string[] = [];
    for (let i = 0; i < (payload.input_paths || []).length; i++) {
      const local = path.join(workDir, `in_${i}${path.extname(payload.input_paths[i]) || '.mp4'}`);
      await downloadFromStorage(payload.input_paths[i], local);
      localInputs.push(local);
    }

    // 2. Resolve placeholder tokens in ffmpeg_args:
    //   {{INPUT_0}}, {{INPUT_1}} → localInputs[i]
    //   {{OUTPUT}}              → workDir/out.mp4
    const outputLocal = path.join(workDir, 'out.mp4');
    const resolvedArgs = payload.ffmpeg_args.map((arg) => {
      let a = arg;
      a = a.replace(/\{\{INPUT_(\d+)\}\}/g, (_, idx) => localInputs[Number(idx)] || arg);
      a = a.replace(/\{\{OUTPUT\}\}/g, outputLocal);
      return a;
    });

    log(`running ffmpeg for job ${job.id}`);
    await runFfmpeg(resolvedArgs);

    // 3. Upload output
    const publicUrl = await uploadToStorage(payload.output_path, outputLocal);
    log(`uploaded output for job ${job.id} → ${payload.output_path}`);

    // 4. Mark completed
    await supabase.from('render_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      progress_pct: 100,
      progress_message: 'done',
      result: { output_url: publicUrl, output_path: payload.output_path },
    }).eq('id', job.id);

    // 5. If this job is tied to an ai_edit_jobs row, mark that completed too
    if (payload.edit_job_id) {
      await supabase.from('ai_edit_jobs').update({
        status: 'completed',
        output_url: publicUrl,
        preview_url: publicUrl,
        finished_at: new Date().toISOString(),
      }).eq('id', payload.edit_job_id);
    }
  } finally {
    try { await fs.rm(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

async function tick(): Promise<'claimed' | 'idle' | 'error'> {
  let job: RenderJobRow | null;
  try {
    job = await claimNextJob();
  } catch (e) {
    log('claim error:', (e as Error).message);
    return 'error';
  }
  if (!job) return 'idle';

  try {
    await processJob(job);
    return 'claimed';
  } catch (e) {
    const msg = (e as Error).message || String(e);
    log(`job ${job.id} failed:`, msg);

    // Retry policy
    if (job.retry_count < job.max_retries) {
      await supabase.from('render_jobs').update({
        status: 'queued',
        node_id: null,
        started_at: null,
        retry_count: job.retry_count + 1,
        progress_message: `requeued after failure: ${msg.slice(0, 200)}`,
      }).eq('id', job.id);
      log(`requeued job ${job.id} (attempts ${job.retry_count + 1}/${job.max_retries})`);
    } else {
      await supabase.from('render_jobs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: msg.slice(0, 2000),
      }).eq('id', job.id);
      log(`dead-lettered job ${job.id} after ${job.max_retries} retries`);
      // If this job is tied to an ai_edit_jobs row, surface the failure
      const edit = job.payload?.edit_job_id;
      if (edit) {
        await supabase.from('ai_edit_jobs').update({
          status: 'failed', error: msg.slice(0, 500),
        }).eq('id', edit);
      }
    }
    return 'error';
  }
}

// Watchdog: reset stale rows every 2 minutes
async function watchdog() {
  while (!stopping) {
    try {
      const { data, error } = await supabase.rpc('reset_stale_render_jobs_10min');
      if (!error && data && data > 0) log(`watchdog reset ${data} stale rows`);
    } catch (e) {
      log('watchdog error:', (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, 120_000));
  }
}

async function main() {
  await fs.mkdir(TMP_DIR, { recursive: true });
  await initLogger();
  log(`starting worker poll=${POLL_INTERVAL_MS}ms tmp=${TMP_DIR} bucket=${BUCKET}`);

  // Start watchdog without awaiting
  void watchdog();

  while (!stopping) {
    const result = await tick();
    if (result === 'idle') {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    } else if (result === 'error') {
      await new Promise((r) => setTimeout(r, Math.max(POLL_INTERVAL_MS, 2000)));
    }
    // 'claimed' → loop immediately
  }

  log('worker stopped cleanly');
  if (logStream) logStream.end();
}

main().catch((e) => {
  log('fatal:', (e as Error).message);
  process.exit(1);
});
