/**
 * Intake system limits — configurable via env vars.
 * Centralized so poll, worker, and UI use identical values.
 */

/** Max file size in bytes. Default 1.5 GB. */
export const MAX_INTAKE_FILE_BYTES = parseInt(
  process.env.MAX_INTAKE_FILE_BYTES || String(1.5 * 1024 * 1024 * 1024),
  10,
);

/** Min file size in bytes. Default 500 KB. */
export const MIN_INTAKE_FILE_BYTES = 500 * 1024;

/** Max video duration in minutes. Default 60. */
export const MAX_INTAKE_MINUTES = parseInt(
  process.env.MAX_INTAKE_MINUTES || '60',
  10,
);

/** Max files per workspace per month. Default 200. */
export const MAX_FILES_PER_MONTH = parseInt(
  process.env.MAX_FILES_PER_MONTH || '200',
  10,
);

/** Max total minutes per workspace per month. Default 1000. */
export const MAX_MINUTES_PER_MONTH = parseInt(
  process.env.MAX_MINUTES_PER_MONTH || '1000',
  10,
);

/** Max jobs the worker processes per cron run. */
export const INTAKE_BATCH_SIZE = 5;

/** Max retry attempts before marking FAILED_PERMANENT. */
export const MAX_RETRY_ATTEMPTS = 3;

/** Failure reason codes for drive_intake_jobs. */
export type IntakeFailureReason =
  | 'FILE_TOO_LARGE'
  | 'FILE_TOO_SMALL'
  | 'INVALID_MIMETYPE'
  | 'DURATION_LIMIT_EXCEEDED'
  | 'MONTHLY_LIMIT_EXCEEDED'
  | 'NEEDS_APPROVAL'
  | 'DEFERRED'
  | 'INTAKE_DISABLED'
  | 'REJECTED_BY_USER'
  | 'FAILED_PERMANENT';

/** Human-readable messages for failure reasons. */
export const FAILURE_MESSAGES: Record<IntakeFailureReason, string> = {
  FILE_TOO_LARGE: `File exceeds maximum size (${(MAX_INTAKE_FILE_BYTES / 1024 / 1024 / 1024).toFixed(1)} GB limit)`,
  FILE_TOO_SMALL: `File is too small (minimum ${(MIN_INTAKE_FILE_BYTES / 1024).toFixed(0)} KB)`,
  INVALID_MIMETYPE: 'File is not a supported video format',
  DURATION_LIMIT_EXCEEDED: `Video exceeds maximum duration (${MAX_INTAKE_MINUTES} min limit)`,
  MONTHLY_LIMIT_EXCEEDED: 'Monthly intake limit reached — upgrade or wait for next month',
  NEEDS_APPROVAL: 'Awaiting operator approval (cost or size threshold exceeded)',
  DEFERRED: 'Daily cap reached — will retry next day',
  INTAKE_DISABLED: 'Intake is disabled for this user',
  REJECTED_BY_USER: 'Rejected by operator',
  FAILED_PERMANENT: 'Failed after maximum retry attempts',
};

/** Validation error thrown during intake processing. */
export class IntakeValidationError extends Error {
  constructor(
    public readonly reason: IntakeFailureReason,
    message?: string,
  ) {
    super(message || FAILURE_MESSAGES[reason]);
    this.name = 'IntakeValidationError';
  }
}
