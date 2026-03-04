/**
 * Cron: Drive Intake Worker
 *
 * Processes PENDING intake jobs:
 *   1. Validate file metadata (size, MIME, duration)
 *   2. Stream download from Google Drive to temp file
 *   3. Extract duration via ffprobe
 *   4. Check monthly usage limits
 *   5. Upload to Supabase Storage
 *   6. Transcribe via OpenAI Whisper
 *   7. Generate edit notes (AI + template)
 *   8. Create pipeline item (videos table row)
 *
 * Queue protection:
 *   - claim_intake_jobs RPC (SELECT FOR UPDATE SKIP LOCKED)
 *   - Max 5 jobs per run
 *   - Exponential backoff on retry (2^attempts * 30s)
 *   - FAILED_PERMANENT after 3 attempts
 *
 * Protected by CRON_SECRET.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getFileMetadata, downloadFileStream, VIDEO_MIME_TYPES } from '@/lib/intake/google-drive';
import { generateEditNotes } from '@/lib/intake/edit-notes-generator';
import { readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  MAX_INTAKE_FILE_BYTES,
  MIN_INTAKE_FILE_BYTES,
  MAX_INTAKE_MINUTES,
  MAX_FILES_PER_MONTH,
  MAX_MINUTES_PER_MONTH,
  INTAKE_BATCH_SIZE,
  MAX_RETRY_ATTEMPTS,
  IntakeValidationError,
  FAILURE_MESSAGES,
} from '@/lib/intake/intake-limits';
import { getUserIntakeSettings, type IntakeSettings } from '@/lib/intake/intake-settings';
import { estimateIntakeCost } from '@/lib/finops/intake-cost';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { captureRouteError } from '@/lib/errorTracking';
import { markCaptured } from '@/lib/errors/withErrorCapture';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

const LOG = '[cron/drive-intake-worker]';
const STORAGE_BUCKET = 'video-files';
const execFileAsync = promisify(execFile);

interface IntakeJob {
  id: string;
  user_id: string;
  connector_id: string;
  drive_file_id: string;
  drive_file_name: string | null;
  status: string;
  attempts: number;
  failure_reason: string | null;
}

function isTransient(msg: string): boolean {
  const lower = msg.toLowerCase();
  return lower.includes('timeout') || lower.includes('econnreset') ||
    lower.includes('rate') || lower.includes('429') ||
    lower.includes('503') || lower.includes('network');
}

/**
 * Extract video duration in seconds using ffprobe.
 * Returns 0 if ffprobe is unavailable or fails.
 */
async function getVideoDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      filePath,
    ], { timeout: 30_000 });

    const data = JSON.parse(stdout);
    return parseFloat(data.format?.duration || '0');
  } catch {
    return 0; // ffprobe unavailable — don't block
  }
}

/**
 * Get current month string (YYYY-MM).
 */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Status set on a job when guardrails block normal processing.
 * Distinct from IntakeValidationError (which is a hard reject).
 */
type GuardrailStatus = 'NEEDS_APPROVAL' | 'DEFERRED';

class GuardrailHaltError extends Error {
  constructor(
    public readonly guardrailStatus: GuardrailStatus,
    public readonly reason: string,
  ) {
    super(reason);
    this.name = 'GuardrailHaltError';
  }
}

/**
 * Check guardrails that require approval or deferral BEFORE processing.
 * Throws GuardrailHaltError if the job should be halted.
 */
async function checkGuardrails(
  userId: string,
  settings: IntakeSettings,
  fileSizeBytes: number,
  durationMinutes: number,
  estimatedCostUsd: number,
): Promise<void> {
  const month = currentMonth();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Approval-above-size threshold
  if (settings.requireApprovalAboveMb != null) {
    const fileMb = fileSizeBytes / (1024 * 1024);
    if (fileMb > settings.requireApprovalAboveMb) {
      throw new GuardrailHaltError('NEEDS_APPROVAL',
        `File ${fileMb.toFixed(0)} MB exceeds approval threshold (${settings.requireApprovalAboveMb} MB)`);
    }
  }

  // Approval-above-duration threshold
  if (settings.requireApprovalAboveMin != null) {
    if (durationMinutes > settings.requireApprovalAboveMin) {
      throw new GuardrailHaltError('NEEDS_APPROVAL',
        `Duration ${durationMinutes.toFixed(1)} min exceeds approval threshold (${settings.requireApprovalAboveMin} min)`);
    }
  }

  // Monthly cost cap check
  const { data: rollup } = await supabaseAdmin
    .from('drive_intake_usage_rollups')
    .select('estimated_cost_usd')
    .eq('user_id', userId)
    .eq('month', month)
    .single();

  const currentCost = parseFloat(String(rollup?.estimated_cost_usd || 0));
  if (currentCost + estimatedCostUsd > settings.monthlyCostCapUsd) {
    throw new GuardrailHaltError('NEEDS_APPROVAL',
      `Monthly cost would reach $${(currentCost + estimatedCostUsd).toFixed(2)} (cap: $${settings.monthlyCostCapUsd.toFixed(2)})`);
  }

  // Daily cap check — count today's jobs
  const { count: todayFiles } = await supabaseAdmin
    .from('drive_intake_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['SUCCEEDED', 'RUNNING'])
    .gte('created_at', `${today}T00:00:00Z`);

  if ((todayFiles || 0) >= settings.dailyFileCap) {
    throw new GuardrailHaltError('DEFERRED', `Daily file cap reached (${todayFiles}/${settings.dailyFileCap})`);
  }

  // Daily minutes cap — sum today's durations from rollups is not granular enough,
  // so we use the jobs result column instead
  const { data: todayJobs } = await supabaseAdmin
    .from('drive_intake_jobs')
    .select('result')
    .eq('user_id', userId)
    .eq('status', 'SUCCEEDED')
    .gte('created_at', `${today}T00:00:00Z`);

  const todayMinutes = (todayJobs || []).reduce((sum, j) => {
    const dur = (j.result as Record<string, unknown>)?.duration_seconds;
    return sum + (typeof dur === 'number' ? dur / 60 : 0);
  }, 0);

  if (todayMinutes + durationMinutes > settings.dailyMinutesCap) {
    throw new GuardrailHaltError('DEFERRED',
      `Daily minutes cap reached (${todayMinutes.toFixed(1)}+${durationMinutes.toFixed(1)}/${settings.dailyMinutesCap} min)`);
  }
}

/**
 * Check and increment monthly usage. Throws IntakeValidationError if exceeded.
 */
async function checkAndIncrementUsage(
  userId: string,
  durationMinutes: number,
  settings: IntakeSettings,
): Promise<{ totalFiles: number; totalMinutes: number }> {
  const month = currentMonth();

  // Upsert usage row (create if missing)
  const { data: usage, error: upsertErr } = await supabaseAdmin
    .from('drive_intake_usage')
    .upsert(
      { user_id: userId, month, total_files: 0, total_minutes: 0, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,month', ignoreDuplicates: true },
    )
    .select('total_files, total_minutes')
    .single();

  // If upsert didn't return (ignoreDuplicates), fetch
  let currentFiles = usage?.total_files || 0;
  let currentMinutes = usage?.total_minutes || 0;

  if (!usage || upsertErr) {
    const { data: existing } = await supabaseAdmin
      .from('drive_intake_usage')
      .select('total_files, total_minutes')
      .eq('user_id', userId)
      .eq('month', month)
      .single();

    currentFiles = existing?.total_files || 0;
    currentMinutes = existing?.total_minutes || 0;
  }

  // Check limits (use per-user settings)
  if (currentFiles + 1 > settings.monthlyFileCap) {
    throw new IntakeValidationError('MONTHLY_LIMIT_EXCEEDED',
      `Monthly file limit reached (${currentFiles}/${settings.monthlyFileCap})`);
  }
  if (currentMinutes + durationMinutes > settings.monthlyMinutesCap) {
    throw new IntakeValidationError('MONTHLY_LIMIT_EXCEEDED',
      `Monthly minutes limit reached (${currentMinutes.toFixed(1)}/${settings.monthlyMinutesCap} min)`);
  }

  // Increment
  await supabaseAdmin.rpc('increment_intake_usage', {
    p_user_id: userId,
    p_month: month,
    p_files: 1,
    p_minutes: durationMinutes,
  });

  return {
    totalFiles: currentFiles + 1,
    totalMinutes: currentMinutes + durationMinutes,
  };
}

export const GET = withErrorCapture(async (request: Request) => {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.DRIVE_TOKEN_ENCRYPTION_KEY) {
    return NextResponse.json({ ok: true, skipped: 'Drive intake not configured' });
  }

  const startedAt = Date.now();

  try {
    // Claim jobs via RPC (SELECT FOR UPDATE SKIP LOCKED)
    const { data: jobs, error: claimErr } = await supabaseAdmin
      .rpc('claim_intake_jobs', { batch_limit: INTAKE_BATCH_SIZE }) as {
        data: IntakeJob[] | null;
        error: { message: string } | null;
      };

    // Fallback: if RPC doesn't exist yet, use regular query
    if (claimErr && claimErr.message.includes('claim_intake_jobs')) {
      console.warn(`${LOG} claim_intake_jobs RPC not found, using fallback query`);
      return await fallbackClaimAndProcess(startedAt);
    }

    if (claimErr) throw new Error(`Claim jobs: ${claimErr.message}`);
    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, message: 'No pending jobs' });
    }

    const result = await processJobBatch(jobs);

    return NextResponse.json({
      ok: true,
      ...result,
      durationMs: Date.now() - startedAt,
    });

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    captureRouteError(error, {
      route: '/api/cron/drive-intake-worker',
      feature: 'drive-intake',
    });
    markCaptured(error);
    console.error(`${LOG} Fatal:`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}, { routeName: '/api/cron/drive-intake-worker', feature: 'drive-intake' });

/**
 * Fallback job claim for pre-migration environments.
 */
async function fallbackClaimAndProcess(startedAt: number) {
  const { data: jobs, error: fetchErr } = await supabaseAdmin
    .from('drive_intake_jobs')
    .select('*')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true })
    .limit(INTAKE_BATCH_SIZE) as { data: IntakeJob[] | null; error: { message: string } | null };

  if (fetchErr) throw new Error(`Fetch jobs: ${fetchErr.message}`);
  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No pending jobs' });
  }

  // Mark as RUNNING (non-atomic fallback)
  for (const job of jobs) {
    await supabaseAdmin
      .from('drive_intake_jobs')
      .update({
        status: 'RUNNING',
        attempts: (job.attempts || 0) + 1,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
  }

  const result = await processJobBatch(jobs);
  return NextResponse.json({ ok: true, ...result, durationMs: Date.now() - startedAt });
}

/**
 * Process a batch of claimed jobs.
 */
async function processJobBatch(jobs: IntakeJob[]) {
  let succeeded = 0;
  let failed = 0;
  let retryLater = 0;

  for (const job of jobs) {
    try {
      const result = await processJob(job);

      await supabaseAdmin
        .from('drive_intake_jobs')
        .update({
          status: 'SUCCEEDED',
          result,
          failure_reason: null,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      await supabaseAdmin
        .from('drive_intake_events')
        .update({ status: 'PROCESSED', updated_at: new Date().toISOString() })
        .eq('user_id', job.user_id)
        .eq('drive_file_id', job.drive_file_id);

      succeeded++;
      console.log(`${LOG} Job ${job.id} SUCCEEDED: ${job.drive_file_name}`);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isValidation = err instanceof IntakeValidationError;
      const isGuardrail = err instanceof GuardrailHaltError;
      const attempts = (job.attempts || 0) + 1;

      // Guardrail halts → set to NEEDS_APPROVAL or DEFERRED, not FAILED
      if (isGuardrail) {
        const halt = err as GuardrailHaltError;
        await supabaseAdmin
          .from('drive_intake_jobs')
          .update({
            status: halt.guardrailStatus,
            last_error: msg.slice(0, 1000),
            failure_reason: halt.guardrailStatus,
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        // Track in rollups (non-fatal)
        try {
          await supabaseAdmin.rpc('increment_intake_rollup', {
            p_user_id: job.user_id,
            p_month: currentMonth(),
            p_status: halt.guardrailStatus === 'DEFERRED' ? 'deferred' : 'approved',
          });
        } catch { /* non-fatal */ }

        console.log(`${LOG} Job ${job.id} ${halt.guardrailStatus}: ${msg.slice(0, 200)}`);
        failed++; // Count as not-succeeded for batch reporting
        continue;
      }

      // Validation errors are permanent — no retry
      // Transient errors retry with exponential backoff up to MAX_RETRY_ATTEMPTS
      const canRetry = !isValidation && isTransient(msg) && attempts < MAX_RETRY_ATTEMPTS;
      const finalStatus = canRetry ? 'PENDING' : 'FAILED';
      const failureReason = isValidation
        ? (err as IntakeValidationError).reason
        : (!canRetry && attempts >= MAX_RETRY_ATTEMPTS ? 'FAILED_PERMANENT' : null);

      // Exponential backoff: 2^attempts * 30s
      const backoffMs = canRetry ? Math.pow(2, attempts) * 30_000 : null;
      const nextAttemptAt = backoffMs
        ? new Date(Date.now() + backoffMs).toISOString()
        : null;

      await supabaseAdmin
        .from('drive_intake_jobs')
        .update({
          status: finalStatus,
          last_error: msg.slice(0, 1000),
          failure_reason: failureReason,
          next_attempt_at: nextAttemptAt,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (!canRetry) {
        await supabaseAdmin
          .from('drive_intake_events')
          .update({
            status: 'FAILED',
            last_error: msg.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', job.user_id)
          .eq('drive_file_id', job.drive_file_id);

        // Track failed in rollups (non-fatal)
        try {
          await supabaseAdmin.rpc('increment_intake_rollup', {
            p_user_id: job.user_id,
            p_month: currentMonth(),
            p_status: 'failed',
          });
        } catch { /* non-fatal */ }

        failed++;
      } else {
        retryLater++;
      }

      console.error(`${LOG} Job ${job.id} ${canRetry ? `RETRY (${backoffMs! / 1000}s)` : `FAILED [${failureReason}]`}: ${msg.slice(0, 200)}`);
    }
  }

  return { processed: jobs.length, succeeded, failed, retryLater };
}

/**
 * Process a single intake job.
 * Throws IntakeValidationError for deterministic rejections.
 */
async function processJob(job: IntakeJob): Promise<Record<string, unknown>> {
  const { user_id, connector_id, drive_file_id, drive_file_name } = job;

  // Get connector config
  const { data: connector } = await supabaseAdmin
    .from('drive_intake_connectors')
    .select('*')
    .eq('id', connector_id)
    .single();

  if (!connector) throw new Error('Connector not found');

  // ── 0. Load per-user settings ──
  const settings = await getUserIntakeSettings(user_id);

  // Kill switch — if intake is disabled for this user, defer immediately
  if (!settings.isActive) {
    throw new GuardrailHaltError('DEFERRED', FAILURE_MESSAGES.INTAKE_DISABLED);
  }

  // ── 1. Pre-download validation (metadata only, no bandwidth) ──
  console.log(`${LOG} Validating ${drive_file_name || drive_file_id}...`);
  const meta = await getFileMetadata(user_id, drive_file_id);
  const { name, mimeType, sizeBytes } = meta;

  // MIME check — use per-user prefix list
  const mimeAllowed = settings.allowedMimePrefixes.some(prefix => mimeType.startsWith(prefix));
  if (!mimeAllowed) {
    throw new IntakeValidationError('INVALID_MIMETYPE', `${mimeType} is not allowed (prefixes: ${settings.allowedMimePrefixes.join(', ')})`);
  }
  if (sizeBytes > 0 && sizeBytes < MIN_INTAKE_FILE_BYTES) {
    throw new IntakeValidationError('FILE_TOO_SMALL', `${(sizeBytes / 1024).toFixed(0)} KB below minimum`);
  }
  const maxFileBytes = settings.maxFileMb * 1024 * 1024;
  if (sizeBytes > maxFileBytes) {
    throw new IntakeValidationError('FILE_TOO_LARGE',
      `${(sizeBytes / 1024 / 1024).toFixed(0)} MB exceeds ${settings.maxFileMb} MB limit`);
  }

  // ── 2. Stream download to temp file ──
  const ext = name.match(/\.(\w+)$/)?.[1] || 'mp4';
  const tmpPath = join(tmpdir(), `intake-${randomUUID()}.${ext}`);

  try {
    console.log(`${LOG} Downloading ${name} (${(sizeBytes / 1024 / 1024).toFixed(1)}MB)...`);
    const { bytesWritten } = await downloadFileStream(user_id, drive_file_id, tmpPath);
    console.log(`${LOG} Downloaded: ${name} (${(bytesWritten / 1024 / 1024).toFixed(1)}MB streamed to disk)`);

    // Post-download size re-check (actual bytes vs metadata)
    if (bytesWritten > maxFileBytes) {
      throw new IntakeValidationError('FILE_TOO_LARGE',
        `Actual file size ${(bytesWritten / 1024 / 1024).toFixed(0)} MB exceeds ${settings.maxFileMb} MB limit`);
    }

    // ── 3. Extract duration via ffprobe ──
    const durationSeconds = await getVideoDuration(tmpPath);
    const durationMinutes = durationSeconds / 60;
    console.log(`${LOG} Duration: ${durationSeconds.toFixed(0)}s (${durationMinutes.toFixed(1)} min)`);

    if (durationSeconds > 0 && durationMinutes > settings.maxVideoMinutes) {
      throw new IntakeValidationError('DURATION_LIMIT_EXCEEDED',
        `${durationMinutes.toFixed(1)} min exceeds ${settings.maxVideoMinutes} min limit`);
    }

    // ── 3b. Estimate cost for guardrail checks ──
    const costEstimate = estimateIntakeCost({
      durationSeconds,
      fileBytes: bytesWritten,
    });

    // Store estimated cost on the job row
    await supabaseAdmin
      .from('drive_intake_jobs')
      .update({ estimated_cost_usd: costEstimate.total_usd })
      .eq('id', job.id);

    // ── 3c. Check guardrails (approval/deferral) ──
    await checkGuardrails(user_id, settings, bytesWritten, durationMinutes, costEstimate.total_usd);

    // ── 4. Check + increment monthly usage ──
    const usage = await checkAndIncrementUsage(user_id, durationMinutes, settings);
    console.log(`${LOG} Usage: ${usage.totalFiles} files, ${usage.totalMinutes.toFixed(1)} min this month`);

    // ── 5. Upload to Supabase Storage ──
    const storagePath = `${user_id}/intake/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;

    // Ensure bucket exists
    try {
      await supabaseAdmin.storage.createBucket(STORAGE_BUCKET, {
        public: true,
        fileSizeLimit: Math.min(maxFileBytes, 2 * 1024 * 1024 * 1024),
        allowedMimeTypes: VIDEO_MIME_TYPES,
      });
    } catch { /* bucket exists */ }

    const fileBuffer = await readFile(tmpPath);
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: false });

    if (uploadErr) throw new Error(`Storage upload: ${uploadErr.message}`);

    const { data: urlData } = supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    const videoUrl = urlData.publicUrl;
    console.log(`${LOG} Stored: ${videoUrl}`);

    // ── 6. Transcribe ──
    let transcript = '';
    let segments: Array<{ start: number; end: number; text: string }> = [];
    let whisperDuration = durationSeconds;

    if (connector.create_transcript) {
      try {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI();
        const { createReadStream } = await import('fs');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const file = createReadStream(tmpPath) as any;

        const response = await openai.audio.transcriptions.create({
          file,
          model: 'whisper-1',
          response_format: 'verbose_json',
          timestamp_granularities: ['segment'],
        });

        transcript = response.text || '';
        whisperDuration = response.duration || durationSeconds;
        segments = (response.segments || []).map(s => ({
          start: s.start,
          end: s.end,
          text: s.text,
        }));

        console.log(`${LOG} Transcribed: ${transcript.length} chars, ${whisperDuration.toFixed(0)}s`);
      } catch (err) {
        console.warn(`${LOG} Transcription failed (non-fatal):`, err instanceof Error ? err.message : err);
      }
    }

    // Use the best duration we have
    const finalDuration = whisperDuration || durationSeconds;

    // ── 6b. Content Item Mapping ──
    let matchedContentItemId: string | null = null;
    try {
      // Priority 1: Folder match — check if parent folder matches a content item
      if (meta.parentFolderIds?.length) {
        for (const parentId of meta.parentFolderIds) {
          const { data: folderMatch } = await supabaseAdmin
            .from('content_items')
            .select('id')
            .eq('drive_folder_id', parentId)
            .eq('workspace_id', user_id)
            .limit(1)
            .maybeSingle();
          if (folderMatch) {
            matchedContentItemId = folderMatch.id;
            break;
          }
        }
      }

      // Priority 2: Filename token match — look for [FF-xxxxxx] in filename
      if (!matchedContentItemId && name) {
        const tokenMatch = name.match(/\[FF-([a-f0-9]{6})\]/i);
        if (tokenMatch) {
          const shortId = `FF-${tokenMatch[1]}`;
          const { data: tokenResult } = await supabaseAdmin
            .from('content_items')
            .select('id')
            .eq('short_id', shortId)
            .eq('workspace_id', user_id)
            .limit(1)
            .maybeSingle();
          if (tokenResult) {
            matchedContentItemId = tokenResult.id;
          }
        }
      }

      // Attach raw footage asset if matched
      if (matchedContentItemId) {
        // Dedupe guard: skip if this file is already attached
        const { data: existingAsset } = await supabaseAdmin
          .from('content_item_assets')
          .select('id')
          .eq('content_item_id', matchedContentItemId)
          .eq('kind', 'raw_footage')
          .eq('file_id', drive_file_id)
          .maybeSingle();

        if (existingAsset) {
          console.log(`${LOG} Skipping duplicate asset for content item ${matchedContentItemId}: ${drive_file_id}`);
        } else {
          console.log(`${LOG} Matched content item ${matchedContentItemId} for ${name}`);
          await supabaseAdmin.from('content_item_assets').insert({
            content_item_id: matchedContentItemId,
            kind: 'raw_footage',
            source: 'google_drive',
            file_id: drive_file_id,
            file_name: name,
            file_url: `https://drive.google.com/file/d/${drive_file_id}/view`,
            metadata: { mime_type: mimeType, size_bytes: bytesWritten, duration_seconds: finalDuration },
          });

          // Set raw footage fields on content_items row (first footage wins)
          // Also queue transcript processing if intake didn't already transcribe
          const driveViewUrl = `https://drive.google.com/file/d/${drive_file_id}/view`;
          const ciUpdate: Record<string, unknown> = {
            raw_footage_drive_file_id: drive_file_id,
            raw_footage_url: driveViewUrl,
          };

          if (transcript.length > 0) {
            // Intake already transcribed — store and mark complete, queue editor notes
            await supabaseAdmin.from('content_item_assets').insert({
              content_item_id: matchedContentItemId,
              kind: 'transcript',
              source: 'generated',
              metadata: { text: transcript, timestamps: segments },
            });
            ciUpdate.transcript_status = 'completed';
            ciUpdate.editor_notes_status = 'pending'; // queue for AI editor notes
          } else {
            // No transcript yet — queue for processing worker
            ciUpdate.transcript_status = 'pending';
          }

          await supabaseAdmin
            .from('content_items')
            .update(ciUpdate)
            .eq('id', matchedContentItemId)
            .is('raw_footage_drive_file_id', null); // only if not already set
        }
      }
    } catch (ciErr) {
      // Content item mapping is non-fatal — log and continue
      console.warn(`${LOG} Content item mapping failed (non-fatal):`, ciErr instanceof Error ? ciErr.message : ciErr);
    }

    // ── 7. Generate edit notes ──
    let editNotes: Record<string, unknown> | null = null;
    if (connector.create_edit_notes) {
      try {
        editNotes = await generateEditNotes(transcript, segments, name, finalDuration) as unknown as Record<string, unknown>;
      } catch (err) {
        console.warn(`${LOG} Edit notes failed (non-fatal):`, err instanceof Error ? err.message : err);
      }
    }

    // ── 8. Create pipeline item ──
    let videoId: string | null = null;
    let videoCode: string | null = null;

    if (connector.create_pipeline_item) {
      const code = `INT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const videoInsert: Record<string, unknown> = {
        video_code: code,
        client_user_id: user_id,
        recording_status: 'RECORDED',
        status: 'needs_edit',
        final_video_url: videoUrl,
        recording_notes: transcript.length > 0
          ? `Auto-transcribed from Drive intake: ${name}`
          : `Ingested from Drive: ${name}`,
        editor_notes: editNotes ? JSON.stringify(editNotes) : null,
        brief: {
          source: 'drive_intake',
          drive_file_id,
          drive_file_name: name,
          original_mime_type: mimeType,
          file_size_bytes: bytesWritten,
          duration_seconds: finalDuration,
          has_transcript: transcript.length > 0,
          has_edit_notes: !!editNotes,
          ingested_at: new Date().toISOString(),
        },
      };

      if (connector.assign_to_user_id) {
        videoInsert.assigned_to = connector.assign_to_user_id;
        videoInsert.assigned_at = new Date().toISOString();
      }

      const { data: video, error: videoErr } = await supabaseAdmin
        .from('videos')
        .insert(videoInsert)
        .select('id, video_code')
        .single();

      if (videoErr) throw new Error(`Pipeline insert: ${videoErr.message}`);

      videoId = video.id;
      videoCode = video.video_code;

      // Create video_assets entry (non-fatal if table doesn't exist)
      try {
        await supabaseAdmin.from('video_assets').insert({
          video_id: videoId,
          asset_type: 'raw',
          storage_provider: 'local',
          uri: videoUrl,
          file_name: name,
          mime_type: mimeType,
          byte_size: bytesWritten,
        });
      } catch { /* non-fatal */ }

      // Log event (non-fatal)
      try {
        await supabaseAdmin.from('video_events').insert({
          video_id: videoId,
          event_type: 'drive_intake_created',
          actor: 'drive-intake-worker',
          from_status: null,
          to_status: 'RECORDED',
          details: {
            drive_file_id,
            drive_file_name: name,
            file_size_bytes: bytesWritten,
            duration_seconds: finalDuration,
            has_transcript: transcript.length > 0,
            has_edit_notes: !!editNotes,
          },
        });
      } catch { /* non-fatal */ }

      console.log(`${LOG} Pipeline item created: ${code} (${videoId})`);

      // Link video to content item if matched
      if (matchedContentItemId && videoId) {
        try {
          await supabaseAdmin
            .from('content_items')
            .update({ video_id: videoId })
            .eq('id', matchedContentItemId);
          console.log(`${LOG} Linked video ${videoId} to content item ${matchedContentItemId}`);
        } catch { /* non-fatal */ }
      }
    }

    // ── 9. Track cost in rollups ──
    try {
      await supabaseAdmin.rpc('increment_intake_rollup', {
        p_user_id: user_id,
        p_month: currentMonth(),
        p_files: 1,
        p_minutes: durationMinutes,
        p_bytes: bytesWritten,
        p_cost_usd: costEstimate.total_usd,
        p_status: 'succeeded',
      });
    } catch (rollupErr) {
      console.warn(`${LOG} Rollup increment failed (non-fatal):`, rollupErr instanceof Error ? rollupErr.message : rollupErr);
    }

    return {
      video_url: videoUrl,
      storage_path: storagePath,
      transcript_length: transcript.length,
      duration_seconds: finalDuration,
      segments_count: segments.length,
      has_edit_notes: !!editNotes,
      edit_notes_method: editNotes ? (editNotes as { method?: string }).method : null,
      video_id: videoId,
      video_code: videoCode,
      file_size_bytes: bytesWritten,
      estimated_cost_usd: costEstimate.total_usd,
      usage_files_this_month: usage.totalFiles,
      usage_minutes_this_month: usage.totalMinutes,
      content_item_id: matchedContentItemId,
    };

  } finally {
    // Always clean up temp file
    await unlink(tmpPath).catch(() => {});
  }
}
