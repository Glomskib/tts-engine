/**
 * AI Video Editor — end-to-end smoke test.
 *
 * Generates a synthetic 10-second test video with ffmpeg, uploads it to the
 * `edit-jobs` bucket, creates an ai_edit_jobs row, runs `processEditJob`,
 * and asserts the pipeline produced a final.mp4.
 *
 * Run:
 *   pnpm --filter web exec tsx scripts/smoke-editor-pipeline.ts
 *   pnpm --filter web exec tsx scripts/smoke-editor-pipeline.ts --mode=hook
 *   pnpm --filter web exec tsx scripts/smoke-editor-pipeline.ts --keep
 *
 * Flags:
 *   --mode=quick|hook|ugc|talking_head  (default: hook)
 *   --keep                              don't clean up the job row at the end
 *   --user-id=UUID                      use a specific user (default: SMOKE_USER_ID env or admin)
 *
 * Required env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 *   ANTHROPIC_API_KEY (optional — pipeline falls back to heuristic plan)
 *
 * Exit code 0 = pass, non-zero = fail. Also prints a JSON summary.
 */
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { processEditJob, BUCKET_NAME, ensureEditJobsBucket, type EditMode } from '@/lib/editor/pipeline';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath: string = require('ffmpeg-static');

interface Args {
  mode: EditMode;
  keep: boolean;
  userId?: string;
}

function parseArgs(): Args {
  const a: Args = { mode: 'hook', keep: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--mode=')) {
      const v = arg.slice('--mode='.length);
      if (['quick', 'hook', 'ugc', 'talking_head'].includes(v)) {
        a.mode = v as EditMode;
      }
    } else if (arg === '--keep') {
      a.keep = true;
    } else if (arg.startsWith('--user-id=')) {
      a.userId = arg.slice('--user-id='.length);
    }
  }
  return a;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

/**
 * Generate a synthetic test clip:
 *   - 10 seconds, 720x1280 (vertical), 30fps
 *   - Solid teal bg with a moving timestamp text
 *   - Sine-wave audio at 440Hz with two 0.4s silence gaps
 *
 * Whisper will transcribe the audio as nothing useful (no words, just a tone),
 * but the pipeline should still produce a valid final.mp4.
 */
async function generateTestClip(outFile: string): Promise<void> {
  // Solid teal video + sine audio with silence gaps via volume keyframes
  await runFfmpeg([
    '-y',
    '-f', 'lavfi',
    '-i', 'color=c=0x00897b:s=720x1280:r=30:d=10',
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:sample_rate=44100:duration=10',
    '-vf', `drawtext=text='SMOKE %{n}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2`,
    '-af', 'volume=enable=between(t\\,3\\,3.5):volume=0,volume=enable=between(t\\,7\\,7.5):volume=0',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    outFile,
  ]);
}

async function pickSmokeUserId(explicit: string | undefined): Promise<string> {
  if (explicit) return explicit;
  const envId = process.env.SMOKE_USER_ID;
  if (envId) return envId;

  // Fallback: pick the first admin user.
  const { data, error } = await supabaseAdmin
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();

  if (error || !data?.user_id) {
    throw new Error('No SMOKE_USER_ID env var and no admin user found. Set SMOKE_USER_ID or pass --user-id=<uuid>.');
  }
  return data.user_id as string;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const userId = await pickSmokeUserId(args.userId);

  console.log(JSON.stringify({ phase: 'start', mode: args.mode, userId }));

  await ensureEditJobsBucket();

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smoke-editor-'));
  const localClip = path.join(workDir, 'smoke.mp4');

  console.log(JSON.stringify({ phase: 'generating-clip', file: localClip }));
  await generateTestClip(localClip);
  const stat = await fs.stat(localClip);
  console.log(JSON.stringify({ phase: 'clip-generated', bytes: stat.size }));

  // Create the job row
  const { data: job, error: insErr } = await supabaseAdmin
    .from('ai_edit_jobs')
    .insert({
      user_id: userId,
      title: `[SMOKE] editor pipeline ${new Date().toISOString()}`,
      mode: args.mode,
      status: 'queued',
      assets: [],
      mode_options: { platform: 'tiktok_shop', notes: 'Smoke test — synthetic clip.' },
    })
    .select('id')
    .single();
  if (insErr || !job) throw new Error(`Failed to insert job: ${insErr?.message}`);
  const jobId = job.id as string;

  try {
    // Upload the test clip
    const storagePath = `${userId}/${jobId}/raw/${Date.now()}_smoke.mp4`;
    const buf = await fs.readFile(localClip);
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buf, { contentType: 'video/mp4', upsert: true });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    // Attach to the job
    const { error: attachErr } = await supabaseAdmin
      .from('ai_edit_jobs')
      .update({ assets: [{ kind: 'raw', path: storagePath, name: 'smoke.mp4' }] })
      .eq('id', jobId);
    if (attachErr) throw new Error(`Asset attach failed: ${attachErr.message}`);

    console.log(JSON.stringify({ phase: 'running-pipeline', jobId }));
    const t0 = Date.now();
    await processEditJob(jobId, { isPaid: true });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    // Verify
    const { data: finalRow } = await supabaseAdmin
      .from('ai_edit_jobs')
      .select('status,output_url,error,edit_plan,progress_pct,phase_message')
      .eq('id', jobId)
      .single();

    const summary = {
      phase: 'pipeline-complete',
      jobId,
      elapsed_sec: elapsed,
      status: finalRow?.status,
      progress_pct: finalRow?.progress_pct,
      phase_message: finalRow?.phase_message,
      has_output: Boolean(finalRow?.output_url),
      output_url_prefix: finalRow?.output_url ? String(finalRow.output_url).slice(0, 80) : null,
      edit_plan_source: (finalRow?.edit_plan as { source?: string } | null)?.source ?? null,
      edit_plan_keep_ranges:
        Array.isArray((finalRow?.edit_plan as { keep_ranges?: unknown[] } | null)?.keep_ranges)
          ? (finalRow!.edit_plan as { keep_ranges: unknown[] }).keep_ranges.length
          : 0,
      error: finalRow?.error,
    };
    console.log(JSON.stringify(summary, null, 2));

    if (finalRow?.status !== 'completed' || !finalRow?.output_url) {
      throw new Error(`Pipeline did not complete cleanly: status=${finalRow?.status} err=${finalRow?.error}`);
    }

    // HEAD-check the output URL
    const head = await fetch(finalRow.output_url, { method: 'HEAD' });
    if (!head.ok) throw new Error(`Output URL HEAD returned ${head.status}`);
    const contentLength = head.headers.get('content-length');
    console.log(JSON.stringify({ phase: 'output-verified', http: head.status, content_length: contentLength }));
  } finally {
    if (!args.keep) {
      console.log(JSON.stringify({ phase: 'cleanup', jobId }));
      // Remove storage objects under this job
      const prefix = `${userId}/${jobId}`;
      try {
        const { data: files } = await supabaseAdmin.storage.from(BUCKET_NAME).list(prefix, { limit: 1000 });
        if (files && files.length > 0) {
          const paths = files.map((f) => `${prefix}/${f.name}`);
          await supabaseAdmin.storage.from(BUCKET_NAME).remove(paths);
        }
        // Also clean output/ subfolder
        const { data: outFiles } = await supabaseAdmin.storage.from(BUCKET_NAME).list(`${prefix}/output`, { limit: 100 });
        if (outFiles && outFiles.length > 0) {
          const paths = outFiles.map((f) => `${prefix}/output/${f.name}`);
          await supabaseAdmin.storage.from(BUCKET_NAME).remove(paths);
        }
      } catch (e) {
        console.warn('cleanup storage failed', e);
      }
      await supabaseAdmin.from('ai_edit_jobs').delete().eq('id', jobId);
    } else {
      console.log(JSON.stringify({ phase: 'kept', jobId, hint: 'Delete from /admin/editor when done.' }));
    }
    try { await fs.rm(workDir, { recursive: true, force: true }); } catch {}
  }

  console.log(JSON.stringify({ phase: 'PASS' }));
}

main().catch((err) => {
  console.error(JSON.stringify({ phase: 'FAIL', error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
