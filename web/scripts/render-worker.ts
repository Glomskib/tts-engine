/**
 * FlashFlow simple render worker.
 *
 * Polls ve_runs for unprocessed rows, claims one, slices the first 30-60s of
 * the uploaded source into a 9:16 1080x1920 MP4, uploads it to Supabase
 * Storage, writes a ve_rendered_clips row, and marks the run complete.
 *
 * The ve_runs.status enum is ('created','transcribing','analyzing','assembling',
 * 'rendering','complete','failed') — there is no 'queued' status. New runs
 * land in 'created', so that is what we poll for.
 *
 * Run: npm run worker
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, unlink, readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const execFileAsync = promisify(execFile);

const POLL_INTERVAL_MS = 3000;
const CLIP_LENGTH_SEC = 45;
const OUTPUT_BUCKET = 'renders';

function ts() { return new Date().toISOString(); }
function log(step: string, data?: unknown) {
  if (data === undefined) console.log(`[worker ${ts()}] ${step}`);
  else console.log(`[worker ${ts()}] ${step}`, typeof data === 'string' ? data : JSON.stringify(data));
}

function getFFmpegPath(): string {
  try {
    const sys = execSync('which ffmpeg', { encoding: 'utf8' }).trim();
    if (sys) return sys;
  } catch { /* no system ffmpeg */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@ffmpeg-installer/ffmpeg').path;
  } catch { /* package not available */ }
  return 'ffmpeg';
}

interface Job {
  run_id: string;
  user_id: string;
  asset_id: string;
  storage_bucket: string;
  storage_path: string;
  duration_sec: number | null;
}

async function claimOneRun(): Promise<Job | null> {
  const { data: runs, error } = await supabaseAdmin
    .from('ve_runs')
    .select('id, user_id')
    .eq('status', 'created')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) { log('CLAIM_QUERY_ERR', error.message); return null; }
  if (!runs || runs.length === 0) return null;
  const run = runs[0];

  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from('ve_runs')
    .update({ status: 'rendering', last_tick_at: new Date().toISOString() })
    .eq('id', run.id)
    .eq('status', 'created')
    .select('id')
    .maybeSingle();
  if (claimErr) { log('CLAIM_UPDATE_ERR', claimErr.message); return null; }
  if (!claimed) { log('CLAIM_LOST', { run_id: run.id }); return null; }

  const { data: asset, error: assetErr } = await supabaseAdmin
    .from('ve_assets')
    .select('id, storage_bucket, storage_path, duration_sec')
    .eq('run_id', run.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (assetErr || !asset) {
    const msg = `No asset row for run: ${assetErr?.message ?? 'null'}`;
    log('NO_ASSET', { run_id: run.id, err: msg });
    await supabaseAdmin.from('ve_runs').update({ status: 'failed', error_message: msg }).eq('id', run.id);
    return null;
  }

  return {
    run_id: run.id,
    user_id: run.user_id,
    asset_id: asset.id,
    storage_bucket: asset.storage_bucket,
    storage_path: asset.storage_path,
    duration_sec: asset.duration_sec !== null ? Number(asset.duration_sec) : null,
  };
}

async function renderClip(job: Job, clipId: string, endSec: number): Promise<{ url: string; path: string; bytes: number }> {
  const workId = randomUUID();
  const srcPath = join(tmpdir(), `ve-wrk-src-${workId}.mp4`);
  const outPath = join(tmpdir(), `ve-wrk-out-${workId}.mp4`);
  const cleanup = [srcPath, outPath];

  try {
    log('DOWNLOAD_START', { bucket: job.storage_bucket, path: job.storage_path });
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from(job.storage_bucket).download(job.storage_path);
    if (dlErr || !blob) throw new Error(`Download failed: ${dlErr?.message ?? 'no blob'}`);
    await writeFile(srcPath, Buffer.from(await blob.arrayBuffer()));
    const { size: srcBytes } = await stat(srcPath);
    log('DOWNLOAD_OK', { bytes: srcBytes });

    // 9:16 centered crop + scale to 1080x1920.
    // scale-up-then-crop-center works for both landscape and portrait source.
    const vf = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1";
    const ffmpeg = getFFmpegPath();
    log('FFMPEG_START', { start: 0, length: endSec, vf });
    await execFileAsync(ffmpeg, [
      '-i', srcPath,
      '-ss', '0',
      '-t', String(endSec),
      '-vf', vf,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-y',
      outPath,
    ], { timeout: 300_000, maxBuffer: 32 * 1024 * 1024 });

    if (!existsSync(outPath)) throw new Error('ffmpeg produced no output');
    const { size: outBytes } = await stat(outPath);
    if (outBytes < 1024) throw new Error(`Output suspiciously small: ${outBytes} bytes`);
    log('FFMPEG_OK', { bytes: outBytes });

    const outputStoragePath = `ve-renders/${job.user_id}/${clipId}.mp4`;
    const body = await readFile(outPath);
    log('UPLOAD_START', { path: outputStoragePath, bytes: outBytes });
    const { error: upErr } = await supabaseAdmin.storage
      .from(OUTPUT_BUCKET)
      .upload(outputStoragePath, body, { contentType: 'video/mp4', upsert: true });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${OUTPUT_BUCKET}/${outputStoragePath}`;
    log('UPLOAD_OK', { url });
    return { url, path: outputStoragePath, bytes: outBytes };
  } finally {
    for (const p of cleanup) {
      try { if (existsSync(p)) await unlink(p); } catch { /* ignore */ }
    }
  }
}

async function processRun(job: Job): Promise<void> {
  log('PROCESS_START', { run_id: job.run_id, asset_id: job.asset_id });
  const endSec = Math.min(CLIP_LENGTH_SEC, job.duration_sec && job.duration_sec > 0 ? job.duration_sec : CLIP_LENGTH_SEC);

  // ve_rendered_clips requires candidate_id (FK NOT NULL). Insert a stub candidate
  // so this simple path can coexist with the full pipeline's candidate schema.
  const { data: cand, error: candErr } = await supabaseAdmin
    .from('ve_clip_candidates')
    .insert({
      run_id: job.run_id,
      asset_id: job.asset_id,
      user_id: job.user_id,
      start_sec: 0,
      end_sec: endSec,
      text: '',
      clip_type: 'worker_slice',
      score: 0,
      selected: true,
      rank: 1,
    })
    .select('id')
    .single();
  if (candErr || !cand) throw new Error(`Candidate insert failed: ${candErr?.message}`);
  log('CANDIDATE_ROW', { id: cand.id });

  const { data: clip, error: clipErr } = await supabaseAdmin
    .from('ve_rendered_clips')
    .insert({
      run_id: job.run_id,
      candidate_id: cand.id,
      user_id: job.user_id,
      template_key: 'worker_slice_9x16',
      mode: 'affiliate',
      status: 'rendering',
    })
    .select('id')
    .single();
  if (clipErr || !clip) throw new Error(`Clip insert failed: ${clipErr?.message}`);
  log('CLIP_ROW', { id: clip.id });

  const result = await renderClip(job, clip.id, endSec);

  await supabaseAdmin.from('ve_rendered_clips').update({
    status: 'complete',
    output_url: result.url,
    duration_sec: endSec,
    completed_at: new Date().toISOString(),
  }).eq('id', clip.id);

  await supabaseAdmin.from('ve_runs').update({
    status: 'complete',
    completed_at: new Date().toISOString(),
  }).eq('id', job.run_id);

  log('DONE', { run_id: job.run_id, output_url: result.url });
}

async function main() {
  log('BOOT', { poll_ms: POLL_INTERVAL_MS, clip_len_sec: CLIP_LENGTH_SEC });
  let running = true;
  process.on('SIGINT', () => { log('SIGINT'); running = false; });
  process.on('SIGTERM', () => { log('SIGTERM'); running = false; });

  while (running) {
    let job: Job | null = null;
    try {
      job = await claimOneRun();
      if (!job) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }
      try {
        await processRun(job);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log('RUN_FAIL', { run_id: job.run_id, err: msg });
        await supabaseAdmin.from('ve_runs').update({
          status: 'failed',
          error_message: msg.substring(0, 500),
        }).eq('id', job.run_id);
      }
    } catch (err) {
      log('LOOP_ERR', err instanceof Error ? err.message : String(err));
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  log('STOP');
  process.exit(0);
}

main().catch((e) => { log('FATAL', e instanceof Error ? e.message : String(e)); process.exit(1); });
