/**
 * AI Video Editor — end-to-end smoke test.
 *
 * What this exercises:
 *   1. Generates a tiny synthetic test mp4 via ffmpeg (5 sec, 1080x1920, with audio)
 *   2. Creates a draft job via POST /api/editor/jobs
 *   3. Gets a signed upload URL via POST /api/editor/jobs/:id/upload/sign
 *   4. PUTs the file to the signed URL
 *   5. Calls POST /api/editor/jobs/:id/upload/finalize
 *   6. Calls POST /api/editor/jobs/:id/start
 *   7. Polls /api/editor/jobs/:id until status='completed' or 'failed'
 *   8. Verifies the edit_plan was generated
 *   9. Downloads the output mp4 and checks it's a valid mp4 with reasonable dims
 *  10. Cleans up the temp file (the server-side raw uploads auto-clean on success)
 *
 * Run (from the `web/` directory of the repo):
 *   npx tsx tests/smoke/editor-pipeline.ts [BASE_URL]
 * Or from repo root:
 *   (cd web && npx tsx tests/smoke/editor-pipeline.ts [BASE_URL])
 *
 * Required env (skips gracefully if missing):
 *   SMOKE_COOKIE or SMOKE_API_KEY  — auth
 *   ffmpeg + ffprobe on PATH (or via ffmpeg-static)
 *
 * Optional env:
 *   SMOKE_BASE_URL                  — default http://localhost:3000
 *   SMOKE_TIMEOUT_MS                — default 600000 (10 min)
 *   SMOKE_KEEP_JOB                  — '1' to skip teardown polling exit
 */
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = process.argv[2] || process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 600_000);
const KEEP_JOB = process.env.SMOKE_KEEP_JOB === '1';

function logStep(msg: string) {
  // eslint-disable-next-line no-console
  console.log(`\n[smoke] ${msg}`);
}

function logOk(msg: string) {
  // eslint-disable-next-line no-console
  console.log(`  ✔ ${msg}`);
}

function logFail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(`  ✖ ${msg}`);
  process.exit(1);
}

function logSkip(reason: string): never {
  // eslint-disable-next-line no-console
  console.log(`[smoke] SKIPPED — ${reason}`);
  process.exit(0);
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.SMOKE_API_KEY) {
    h['Authorization'] = `Bearer ${process.env.SMOKE_API_KEY}`;
  } else if (process.env.SMOKE_COOKIE) {
    h['Cookie'] = process.env.SMOKE_COOKIE;
  } else {
    logSkip('Set SMOKE_API_KEY or SMOKE_COOKIE to run this test against the dev server.');
  }
  return h;
}

async function findFfmpeg(): Promise<string> {
  // Prefer ffmpeg-static if installed (the editor pipeline uses it).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStatic: string | null = require('ffmpeg-static');
    if (ffmpegStatic) return ffmpegStatic;
  } catch { /* ignore */ }
  // Fall back to PATH ffmpeg
  return 'ffmpeg';
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-300)}`));
    });
  });
}

function runCapture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve(out + err);
      else reject(new Error(`${cmd} exited ${code}: ${err.slice(-300)}`));
    });
  });
}

async function makeTestMp4(ffmpeg: string, dest: string) {
  // 5 sec, 1080x1920 (vertical), color bars + 1 kHz tone, h264 + aac.
  await run(ffmpeg, [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc2=duration=5:size=1080x1920:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=5',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    '-c:a', 'aac', '-b:a', '64k',
    '-shortest',
    dest,
  ]);
}

async function checkVideoMeta(ffmpeg: string, file: string): Promise<{ width: number; height: number; duration: number }> {
  const out = await runCapture(ffmpeg, ['-i', file, '-f', 'null', '-']);
  const dim = out.match(/(\d+)x(\d+)/);
  const dur = out.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  const width = dim ? parseInt(dim[1], 10) : 0;
  const height = dim ? parseInt(dim[2], 10) : 0;
  const duration = dur
    ? parseInt(dur[1], 10) * 3600 + parseInt(dur[2], 10) * 60 + parseFloat(dur[3])
    : 0;
  return { width, height, duration };
}

async function main() {
  const ffmpeg = await findFfmpeg();
  logStep(`Using ffmpeg: ${ffmpeg}`);

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ff-editor-smoke-'));
  const inputFile = path.join(workDir, 'input.mp4');
  const outputFile = path.join(workDir, 'output.mp4');

  try {
    logStep('Generating 5-second test mp4 (1080x1920)…');
    await makeTestMp4(ffmpeg, inputFile);
    const stat = await fs.stat(inputFile);
    logOk(`Created ${inputFile} (${(stat.size / 1024).toFixed(1)} KB)`);

    // 1. Create job
    logStep('Creating draft edit job…');
    const createRes = await fetch(`${BASE}/api/editor/jobs`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        title: `[smoke] ${new Date().toISOString()}`,
        mode: 'quick',
        mode_options: { platform: 'tiktok' },
      }),
    });
    if (!createRes.ok) logFail(`POST /api/editor/jobs failed: ${createRes.status} ${await createRes.text()}`);
    const created = await createRes.json();
    const jobId = created.job?.id;
    if (!jobId) logFail('No job.id in response');
    logOk(`Created job ${jobId}`);

    // 2. Sign upload
    logStep('Requesting signed upload URL…');
    const signRes = await fetch(`${BASE}/api/editor/jobs/${jobId}/upload/sign`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ kind: 'raw', name: 'input.mp4', size: stat.size, type: 'video/mp4' }),
    });
    if (!signRes.ok) logFail(`POST /sign failed: ${signRes.status} ${await signRes.text()}`);
    const sign = await signRes.json();
    if (!sign.signedUrl || !sign.storagePath) logFail('Sign response missing signedUrl/storagePath');
    logOk(`Got signed URL for ${sign.storagePath}`);

    // 3. PUT to signed URL
    logStep('PUT-ing file to signed URL…');
    const buf = await fs.readFile(inputFile);
    const putRes = await fetch(sign.signedUrl, {
      method: 'PUT',
      headers: {
        'cache-control': 'no-store',
        'x-upsert': 'true',
        'content-type': 'video/mp4',
      },
      body: buf,
    });
    if (!putRes.ok) logFail(`PUT failed: ${putRes.status} ${await putRes.text()}`);
    logOk('Uploaded to storage');

    // 4. Finalize
    logStep('Finalizing upload…');
    const finRes = await fetch(`${BASE}/api/editor/jobs/${jobId}/upload/finalize`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ storagePath: sign.storagePath, kind: 'raw', name: 'input.mp4' }),
    });
    if (!finRes.ok) logFail(`Finalize failed: ${finRes.status} ${await finRes.text()}`);
    logOk('Finalized');

    // 5. Start
    logStep('Starting pipeline…');
    const startRes = await fetch(`${BASE}/api/editor/jobs/${jobId}/start`, {
      method: 'POST',
      headers: authHeaders(),
    });
    if (!startRes.ok) logFail(`Start failed: ${startRes.status} ${await startRes.text()}`);
    logOk('Pipeline queued');

    // 6. Poll
    logStep(`Polling status (timeout ${TIMEOUT_MS / 1000}s)…`);
    const deadline = Date.now() + TIMEOUT_MS;
    let lastStatus = '';
    let lastPct = -1;
    let final: Record<string, unknown> | null = null;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const r = await fetch(`${BASE}/api/editor/jobs/${jobId}`, { headers: authHeaders() });
      if (!r.ok) {
        // eslint-disable-next-line no-console
        console.warn(`  poll: HTTP ${r.status}`);
        continue;
      }
      const j = await r.json();
      const st = j.job?.status as string;
      const pct = (j.job?.progress_pct as number | null) ?? null;
      if (st !== lastStatus || pct !== lastPct) {
        // eslint-disable-next-line no-console
        console.log(`  status=${st} progress=${pct ?? '-'}% ${j.job?.phase_message ? `"${j.job.phase_message}"` : ''}`);
        lastStatus = st;
        lastPct = pct ?? lastPct;
      }
      if (st === 'completed' || st === 'failed') {
        final = j.job;
        break;
      }
    }
    if (!final) logFail('Timed out waiting for completion');
    if (final.status === 'failed') logFail(`Pipeline failed: ${final.error}`);
    logOk('Pipeline completed');

    // 7. Edit plan present?
    logStep('Checking edit_plan…');
    const plan = final.edit_plan as Record<string, unknown> | null;
    if (!plan) logFail('edit_plan was not persisted');
    if (!Array.isArray(plan.keep_ranges)) logFail('edit_plan.keep_ranges missing or not array');
    logOk(`edit_plan source=${String(plan.source)} keeps=${(plan.keep_ranges as unknown[]).length}`);

    // 8. Output mp4 valid?
    logStep('Downloading output mp4…');
    const outputUrl = final.output_url as string | null;
    if (!outputUrl) logFail('No output_url on completed job');
    const outRes = await fetch(outputUrl);
    if (!outRes.ok) logFail(`Output fetch failed: ${outRes.status}`);
    const outBuf = Buffer.from(await outRes.arrayBuffer());
    await fs.writeFile(outputFile, outBuf);
    logOk(`Downloaded output (${(outBuf.length / 1024).toFixed(1)} KB)`);

    logStep('Inspecting output dimensions…');
    const meta = await checkVideoMeta(ffmpeg, outputFile);
    if (meta.width !== 1080 || meta.height !== 1920) {
      logFail(`Expected 1080x1920, got ${meta.width}x${meta.height}`);
    }
    if (meta.duration < 0.5 || meta.duration > 10) {
      logFail(`Unexpected output duration: ${meta.duration}s`);
    }
    logOk(`Output is ${meta.width}x${meta.height} ${meta.duration.toFixed(2)}s`);

    // eslint-disable-next-line no-console
    console.log('\n[smoke] PASS — editor pipeline produced a valid output.');
  } finally {
    if (!KEEP_JOB) {
      try { await fs.rm(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[smoke] FAIL', err);
  process.exit(1);
});
