/**
 * Cron: Drive Intake Poll
 *
 * Polls connected Google Drive folders for new video files.
 * For each new file: creates drive_intake_events (idempotent) + drive_intake_jobs (PENDING).
 * Does NOT download or process — that's the worker's job.
 *
 * Protected by CRON_SECRET.
 * Target: every 5 minutes via Vercel Cron.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { listVideoFiles, VIDEO_MIME_TYPES } from '@/lib/intake/google-drive';
import { MAX_INTAKE_FILE_BYTES, MIN_INTAKE_FILE_BYTES, FAILURE_MESSAGES } from '@/lib/intake/intake-limits';

export const runtime = 'nodejs';
export const maxDuration = 60;

const LOG = '[cron/drive-intake-poll]';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if Google Drive env is configured
  if (!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.DRIVE_TOKEN_ENCRYPTION_KEY) {
    return NextResponse.json({ ok: true, skipped: 'Drive intake not configured' });
  }

  const startedAt = Date.now();

  try {
    // Fetch all CONNECTED connectors with a folder selected
    const { data: connectors, error: fetchErr } = await supabaseAdmin
      .from('drive_intake_connectors')
      .select('*')
      .eq('status', 'CONNECTED')
      .not('folder_id', 'is', null);

    if (fetchErr) throw new Error(`Fetch connectors: ${fetchErr.message}`);
    if (!connectors || connectors.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, message: 'No connected connectors' });
    }

    let totalNewFiles = 0;
    let totalSkipped = 0;
    let connectorErrors = 0;
    const details: Array<{ userId: string; newFiles: number; rejected?: number; error?: string }> = [];

    for (const connector of connectors) {
      // Skip if not due for poll yet
      if (connector.last_poll_at) {
        const lastPoll = new Date(connector.last_poll_at).getTime();
        const intervalMs = (connector.polling_interval_minutes || 5) * 60 * 1000;
        if (Date.now() - lastPoll < intervalMs) {
          totalSkipped++;
          continue;
        }
      }

      try {
        const { files } = await listVideoFiles(connector.user_id, connector.folder_id);

        let newForConnector = 0;
        let rejectedCount = 0;

        for (const file of files) {
          // ── Pre-flight validation ──
          let rejectReason: string | null = null;
          if (file.size > MAX_INTAKE_FILE_BYTES) {
            rejectReason = 'FILE_TOO_LARGE';
          } else if (file.size < MIN_INTAKE_FILE_BYTES) {
            rejectReason = 'FILE_TOO_SMALL';
          } else if (!VIDEO_MIME_TYPES.includes(file.mimeType)) {
            rejectReason = 'INVALID_MIMETYPE';
          }

          // Idempotent insert: unique on (user_id, drive_file_id)
          const { error: eventErr } = await supabaseAdmin
            .from('drive_intake_events')
            .insert({
              user_id: connector.user_id,
              drive_file_id: file.id,
              drive_file_name: file.name,
              drive_mime_type: file.mimeType,
              drive_md5: file.md5Checksum,
              drive_size_bytes: file.size,
              drive_modified_ts: file.modifiedTime || null,
              status: rejectReason ? 'SKIPPED' : 'NEW',
              last_error: rejectReason
                ? (FAILURE_MESSAGES as Record<string, string>)[rejectReason] || rejectReason
                : null,
            })
            .select('id')
            .single();

          // If unique constraint violation, file already seen — skip
          if (eventErr) {
            if (eventErr.code === '23505') continue; // unique_violation
            console.warn(`${LOG} Event insert error for ${file.name}: ${eventErr.message}`);
            continue;
          }

          // If rejected, skip job creation
          if (rejectReason) {
            console.log(`${LOG} Rejected ${file.name}: ${rejectReason} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
            rejectedCount++;
            continue;
          }

          // Create processing job
          const { error: jobErr } = await supabaseAdmin
            .from('drive_intake_jobs')
            .insert({
              user_id: connector.user_id,
              connector_id: connector.id,
              drive_file_id: file.id,
              drive_file_name: file.name,
              status: 'PENDING',
            });

          if (jobErr && jobErr.code !== '23505') {
            console.warn(`${LOG} Job insert error for ${file.name}: ${jobErr.message}`);
          }

          // Update event status to QUEUED
          await supabaseAdmin
            .from('drive_intake_events')
            .update({ status: 'QUEUED', updated_at: new Date().toISOString() })
            .eq('user_id', connector.user_id)
            .eq('drive_file_id', file.id);

          newForConnector++;
        }

        // Update last_poll_at
        await supabaseAdmin
          .from('drive_intake_connectors')
          .update({
            last_poll_at: new Date().toISOString(),
            last_poll_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', connector.id);

        totalNewFiles += newForConnector;
        details.push({ userId: connector.user_id, newFiles: newForConnector, rejected: rejectedCount });

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${LOG} Error polling connector ${connector.id}: ${msg}`);
        connectorErrors++;

        // Mark connector with error if auth-related
        const isAuthError = msg.includes('invalid_grant') || msg.includes('Token has been') || msg.includes('No Drive tokens');
        await supabaseAdmin
          .from('drive_intake_connectors')
          .update({
            status: isAuthError ? 'ERROR' : 'CONNECTED',
            last_poll_at: new Date().toISOString(),
            last_poll_error: msg.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq('id', connector.id);

        details.push({ userId: connector.user_id, newFiles: 0, error: msg.slice(0, 200) });
      }
    }

    const summary = {
      ok: true,
      connectors: connectors.length,
      polled: connectors.length - totalSkipped,
      skipped: totalSkipped,
      newFiles: totalNewFiles,
      errors: connectorErrors,
      durationMs: Date.now() - startedAt,
    };

    console.log(`${LOG} ${JSON.stringify(summary)}`);
    return NextResponse.json(summary);

  } catch (err) {
    const { captureRouteException } = await import('@/lib/errorTracking');
    captureRouteException(err instanceof Error ? err : new Error(String(err)), {
      route: '/api/cron/drive-intake-poll',
    });
    console.error(`${LOG} Fatal:`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
