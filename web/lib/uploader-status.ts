/**
 * uploader-status.ts
 *
 * Central enum, transition map, guards, and structured event logger for the
 * TikTok upload execution lifecycle. UploaderStatus is orthogonal to VideoStatus
 * — it tracks what happens *during* the ready_to_post → posted pipeline
 * transition (in-memory execution status, not a new DB column).
 *
 * Events are written to the existing `video_events` table with
 * `event_type = 'upload_step'`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ─── UploaderStatus ──────────────────────────────────────────────────────────

export type UploaderStatus =
  | 'queued'
  | 'claimed'
  | 'uploading'
  | 'drafted'
  | 'posted'
  | 'failed';

const UPLOADER_STATUSES = new Set<string>([
  'queued', 'claimed', 'uploading', 'drafted', 'posted', 'failed',
]);

/**
 * Valid transitions for the upload execution lifecycle.
 *
 * - queued → claimed | uploading | failed
 *   (uploading directly for scripts without the claim system)
 * - claimed → uploading | failed
 * - uploading → drafted | posted | failed
 * - drafted → posted
 * - posted → [] (terminal)
 * - failed → queued (retry)
 *
 * Self-transitions (e.g. queued → queued) are allowed for state-entry events.
 */
const UPLOADER_TRANSITIONS: Record<UploaderStatus, readonly UploaderStatus[]> = {
  queued:    ['queued', 'claimed', 'uploading', 'failed'],
  claimed:   ['uploading', 'failed'],
  uploading: ['drafted', 'posted', 'failed'],
  drafted:   ['posted'],
  posted:    [],
  failed:    ['queued'],
};

// ─── Guards ──────────────────────────────────────────────────────────────────

/** Type guard — is the value a valid UploaderStatus? */
export function isValidUploaderStatus(v: unknown): v is UploaderStatus {
  return typeof v === 'string' && UPLOADER_STATUSES.has(v);
}

/** Can the upload pipeline transition from → to? */
export function canTransitionUpload(from: UploaderStatus, to: UploaderStatus): boolean {
  return UPLOADER_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throws if the transition is invalid. */
export function assertUploadTransition(from: UploaderStatus, to: UploaderStatus): void {
  if (!canTransitionUpload(from, to)) {
    throw new Error(`Invalid upload transition: ${from} → ${to}`);
  }
}

// ─── StudioUploadResult → UploaderStatus mapping ────────────────────────────

/**
 * Maps a StudioUploadResult.status to an UploaderStatus.
 * Used by upload-from-pack.ts and nightly-upload.ts after the browser
 * automation returns a result.
 */
export function mapResultToUploaderStatus(
  resultStatus: 'drafted' | 'posted' | 'login_required' | 'error',
): UploaderStatus {
  switch (resultStatus) {
    case 'drafted':        return 'drafted';
    case 'posted':         return 'posted';
    case 'login_required': return 'failed';
    case 'error':          return 'failed';
  }
}

// ─── Structured event logger ─────────────────────────────────────────────────

export interface LogUploadStepParams {
  video_id: string;
  from: UploaderStatus;
  to: UploaderStatus;
  step: string;
  actor: string;
  correlation_id?: string;
  error?: string;
  /** Extra key-value pairs merged into details JSON. */
  meta?: Record<string, unknown>;
}

/**
 * Write a structured `upload_step` event to `video_events`.
 *
 * Validates the transition — logs a warning on invalid but does NOT throw,
 * so callers are never blocked by logging failures.
 */
export async function logUploadStep(
  supabase: SupabaseClient,
  params: LogUploadStepParams,
): Promise<void> {
  const { video_id, from, to, step, actor, correlation_id, error, meta } = params;

  if (!canTransitionUpload(from, to)) {
    console.warn(
      `[uploader-status] Invalid transition ${from} → ${to} (step=${step}, video=${video_id}) — logging anyway`,
    );
  }

  try {
    const details: Record<string, unknown> = {
      step,
      source: 'uploader-status',
      ...(error ? { error } : {}),
      ...(meta ?? {}),
    };

    await supabase.from('video_events').insert({
      video_id,
      event_type: 'upload_step',
      actor,
      from_status: from,
      to_status: to,
      correlation_id: correlation_id ?? null,
      details,
    });
  } catch (err) {
    console.error(
      `[uploader-status] Failed to log upload_step (${step}) for ${video_id}:`,
      err,
    );
  }
}
