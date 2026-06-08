// FlashFlow Mac-mini slice-render worker.
// Claims `clip_render` jobs from ff_render_jobs, trims [start,end] from the
// source asset with ffmpeg, uploads the clip to the `renders` bucket, and marks
// the job done. The web pipeline's stageRendering poll then completes the run.
//
// Why this exists: in-process ffmpeg on Vercel can't spawn the binary on the
// serverless runtime, so Create never produced a clip. This runs the render on
// the mini (real ffmpeg) instead. Reuses the existing render-node/.env
// (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
//
// Run on the mini:  pm2 start slice-worker.mjs --name ff-slice-worker
import 'dotenv/config';
import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { createClient } from '@supabase/supabase-js';

const execFileAsync = promisify(execFile);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RENDERS_BUCKET = 'renders';
const POLL_MS = 4000;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('[slice-worker] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required (render-node/.env)');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function ffmpegPath() {
  for (const c of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
    if (fs.existsSync(c)) return c;
  }
  try { const p = execSync('command -v ffmpeg', { encoding: 'utf8' }).trim(); if (p) return p; } catch {}
  return 'ffmpeg';
}
const FFMPEG = ffmpegPath();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function registerWorker() {
  const hostname = `${os.hostname()}-slice`;
  let ffver = 'unknown';
  try { ffver = execSync(`${FFMPEG} -version`, { encoding: 'utf8' }).split('\n')[0].split(' ')[2] || 'unknown'; } catch {}
  const { data, error } = await sb.from('ff_render_workers').upsert({
    hostname,
    status: 'online',
    last_heartbeat_at: new Date().toISOString(),
    ffmpeg_version: ffver,
    cpu_brand: os.cpus()[0]?.model || null,
    os_version: `${os.platform()} ${os.release()}`,
    concurrency_max: 2,
  }, { onConflict: 'hostname' }).select('id').single();
  if (error) throw new Error(`worker register failed: ${error.message}`);
  console.log(`[slice-worker] registered ${hostname} -> ${data.id}  ffmpeg=${FFMPEG} (${ffver})`);
  return data.id;
}

async function downloadSource(spec, dest) {
  // Prefer a service-role storage download (no URL expiry). Fall back to URL.
  if (spec.source_bucket && spec.source_path) {
    const { data, error } = await sb.storage.from(spec.source_bucket).download(spec.source_path);
    if (!error && data) { fs.writeFileSync(dest, Buffer.from(await data.arrayBuffer())); return; }
    console.warn(`[slice-worker] storage download failed (${error?.message}); trying source_url`);
  }
  if (spec.source_url) {
    const r = await fetch(spec.source_url);
    if (!r.ok) throw new Error(`source fetch ${r.status}`);
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    return;
  }
  throw new Error('no source_bucket/path or source_url in slice spec');
}

async function renderJob(job) {
  const spec = typeof job.timeline === 'string' ? JSON.parse(job.timeline) : (job.timeline || {});
  const start = Math.max(0, Number(spec.start_sec) || 0);
  const end = Math.max(start + 0.5, Number(spec.end_sec) || start + 1);
  const len = end - start;
  const work = crypto.randomUUID();
  const src = path.join(os.tmpdir(), `ff-src-${work}.mp4`);
  const out = path.join(os.tmpdir(), `ff-out-${work}.mp4`);
  try {
    await downloadSource(spec, src);
    const foDur = Math.min(0.3, Math.max(0, len - 0.3));
    const foStart = Math.max(0, len - foDur).toFixed(3);
    const vf = `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,fade=t=in:st=0:d=0.2${foDur > 0 ? `,fade=t=out:st=${foStart}:d=${foDur.toFixed(3)}` : ''}`;
    const af = `loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=in:st=0:d=0.2${foDur > 0 ? `,afade=t=out:st=${foStart}:d=${foDur.toFixed(3)}` : ''}`;
    await execFileAsync(FFMPEG, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', src, '-ss', start.toFixed(3), '-t', len.toFixed(3),
      '-vf', vf, '-af', af,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k', out,
    ], { timeout: 240000, maxBuffer: 64 * 1024 * 1024 });
    if (!fs.existsSync(out) || fs.statSync(out).size < 1024) throw new Error('ffmpeg produced no/empty output');
    const bytes = fs.statSync(out).size;
    const key = `ve-renders/${spec.user_id}/${spec.clip_id}.mp4`;
    const body = fs.readFileSync(out);
    const up = await sb.storage.from(RENDERS_BUCKET).upload(key, body, { contentType: 'video/mp4', upsert: true });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${RENDERS_BUCKET}/${key}`;
    const now = new Date().toISOString();
    await sb.from('ff_render_jobs').update({ status: 'done', output_url: publicUrl, output_bytes: bytes, duration_ms: Math.round(len * 1000), completed_at: now, updated_at: now }).eq('id', job.id);
    await sb.from('ve_rendered_clips').update({ status: 'complete', output_url: publicUrl, duration_sec: len, completed_at: now }).eq('ff_render_job_id', job.id);
    console.log(`[slice-worker] DONE job=${job.id} clip=${spec.clip_id} ${bytes}B -> ${publicUrl}`);
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    console.error(`[slice-worker] FAIL job=${job.id}: ${msg}`);
    await sb.from('ff_render_jobs').update({ status: 'failed', error: msg.slice(0, 1000), updated_at: new Date().toISOString() }).eq('id', job.id);
    await sb.from('ve_rendered_clips').update({ status: 'failed', error_message: msg.slice(0, 500) }).eq('ff_render_job_id', job.id);
  } finally {
    for (const f of [src, out]) { try { fs.existsSync(f) && fs.unlinkSync(f); } catch {} }
  }
}

async function main() {
  console.log(`[slice-worker] starting on ${os.hostname()} -> ${SUPABASE_URL}`);
  const workerId = await registerWorker();
  let idle = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await sb.from('ff_render_workers').update({ last_heartbeat_at: new Date().toISOString(), status: 'online' }).eq('id', workerId);
      // Claim WITHOUT the ff_claim_next_render_job RPC (not present in prod's
      // PostgREST schema cache): pick the oldest pending clip_render, then flip
      // it to 'rendering' only if it is still 'pending' — the conditional update
      // makes the claim atomic so concurrent workers can't double-claim.
      const { data: pend } = await sb.from('ff_render_jobs')
        .select('id').eq('status', 'pending').eq('kind', 'clip_render')
        .order('priority', { ascending: true }).order('created_at', { ascending: true }).limit(1);
      if (!pend || pend.length === 0) { idle++; if (idle % 15 === 0) console.log('[slice-worker] queue empty'); await sleep(POLL_MS); continue; }
      const claimIso = new Date().toISOString();
      const { data: claimed } = await sb.from('ff_render_jobs')
        .update({ status: 'rendering', claimed_by: workerId, claimed_at: claimIso, started_at: claimIso, updated_at: claimIso })
        .eq('id', pend[0].id).eq('status', 'pending').select('*').maybeSingle();
      if (!claimed || !claimed.id) { await sleep(250); continue; }
      const job = claimed;
      idle = 0;
      console.log(`[slice-worker] claimed job=${job.id}`);
      await renderJob(job);
    } catch (e) {
      console.error('[slice-worker] loop error:', e?.message || e);
      await sleep(POLL_MS * 2);
    }
  }
}
main().catch((e) => { console.error('[slice-worker] fatal:', e); process.exit(1); });
