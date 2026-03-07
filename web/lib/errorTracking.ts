/**
 * Centralized error tracking.
 *
 * When SENTRY_DSN (or NEXT_PUBLIC_SENTRY_DSN) is configured, errors are
 * forwarded to Sentry with structured tags/context. When DSN is absent,
 * everything falls back to console — no build or runtime errors.
 */
import * as Sentry from '@sentry/nextjs';

// ── Detect Sentry availability at module load ──────────────────────
const sentryActive = !!(
  process.env.SENTRY_DSN ||
  process.env.NEXT_PUBLIC_SENTRY_DSN
);

// ── Types ──────────────────────────────────────────────────────────
export interface ErrorContext {
  componentStack?: string;
  userId?: string;
  page?: string;
  action?: string;
  [key: string]: unknown;
}

export interface CronErrorContext {
  route: string;
  jobId?: string;
  runId?: string;
  workspaceId?: string;
  attempts?: number;
  [key: string]: unknown;
}

// ── Core helpers ───────────────────────────────────────────────────

/**
 * Report an exception (Error or string).
 */
export function reportError(error: Error | string, context?: ErrorContext) {
  const err = typeof error === 'string' ? new Error(error) : error;
  const enriched = {
    ...context,
    timestamp: new Date().toISOString(),
    url: typeof window !== 'undefined' ? window.location.href : 'server',
  };

  if (sentryActive) {
    Sentry.captureException(err, { extra: enriched });
  }

  // Always log to console for observability in Vercel logs
  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', err);
    console.error('Context:', enriched);
  } else {
    console.error(`[Error] ${err.message}`, enriched);
  }
}

/**
 * Report a non-fatal warning.
 */
export function reportWarning(message: string, context?: ErrorContext) {
  const enriched = {
    ...context,
    timestamp: new Date().toISOString(),
    level: 'warning' as const,
  };

  if (sentryActive) {
    Sentry.captureMessage(message, { level: 'warning', extra: enriched });
  }

  if (process.env.NODE_ENV === 'development') {
    console.warn('Warning:', message, enriched);
  } else {
    console.warn(`[Warning] ${message}`, enriched);
  }
}

/**
 * Report a custom event / metric.
 */
export function reportEvent(name: string, data?: Record<string, unknown>) {
  if (sentryActive) {
    Sentry.addBreadcrumb({ category: 'event', message: name, data, level: 'info' });
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('Event:', name, data);
  } else {
    console.log(`[Event] ${name}`, data);
  }
}

// ── Cron / Worker helper ───────────────────────────────────────────

/**
 * Capture an exception from a cron or worker route with structured tags.
 * Tags are indexed in Sentry for fast filtering; extra is for detail.
 *
 * Usage:
 *   captureRouteException(error, {
 *     route: '/api/cron/drive-intake-worker',
 *     jobId: job.id,
 *     workspaceId: job.user_id,
 *     attempts: job.attempts,
 *   });
 */
export function captureRouteException(
  error: Error | string,
  ctx: CronErrorContext,
) {
  const err = typeof error === 'string' ? new Error(error) : error;

  // Build tag map (indexed, searchable in Sentry)
  const tags: Record<string, string> = {
    route: ctx.route,
    type: 'cron',
  };
  if (ctx.jobId) tags.job_id = ctx.jobId;
  if (ctx.runId) tags.run_id = ctx.runId;
  if (ctx.workspaceId) tags.workspace_id = ctx.workspaceId;
  if (ctx.attempts !== undefined) tags.attempts = String(ctx.attempts);

  // Extra context (not indexed, but visible in event detail)
  const { route, jobId, runId, workspaceId, attempts, ...extra } = ctx;

  if (sentryActive) {
    Sentry.withScope((scope) => {
      scope.setTags(tags);
      scope.setExtra('context', { route, jobId, runId, workspaceId, attempts, ...extra });
      Sentry.captureException(err);
    });
  }

  // Always log so Vercel Function Logs capture it
  console.error(`[CronError] ${ctx.route}:`, err.message, tags);
}

/**
 * One-shot message capture (e.g. "B-roll skipped", "monthly limit reached").
 * De-duplicated by fingerprint when provided.
 */
export function captureRouteMessage(
  message: string,
  ctx: CronErrorContext & { fingerprint?: string[] },
  level: 'info' | 'warning' | 'error' = 'warning',
) {
  const tags: Record<string, string> = {
    route: ctx.route,
    type: 'cron',
  };
  if (ctx.jobId) tags.job_id = ctx.jobId;
  if (ctx.workspaceId) tags.workspace_id = ctx.workspaceId;

  if (sentryActive) {
    Sentry.withScope((scope) => {
      scope.setTags(tags);
      if (ctx.fingerprint) scope.setFingerprint(ctx.fingerprint);
      Sentry.captureMessage(message, level);
    });
  }

  const logFn = level === 'error' ? console.error : level === 'warning' ? console.warn : console.log;
  logFn(`[Cron:${level}] ${ctx.route}: ${message}`, tags);
}

// ── Structured route error capture ────────────────────────────────

export interface RouteErrorContext {
  route: string;
  feature?: string;
  workspaceId?: string;
  userId?: string;
  contentItemId?: string;
  fingerprint?: string[];
  severity?: 'error' | 'fatal' | 'warning';
  [key: string]: unknown;
}

/**
 * Production-grade error capture for API routes, cron jobs, and background tasks.
 *
 * Sets indexed Sentry tags for:
 *   route, feature, workspace_id, user_id
 * Plus fingerprint and severity when provided.
 *
 * Always logs to console for Vercel Function Logs observability.
 * Used by withErrorCapture() wrapper and can be called directly.
 */
export function captureRouteError(
  error: Error | string,
  ctx: RouteErrorContext,
) {
  const err = typeof error === 'string' ? new Error(error) : error;
  const severity = ctx.severity ?? 'error';

  // Build indexed tag map
  const tags: Record<string, string> = {
    route: ctx.route,
  };
  if (ctx.feature) tags.feature = ctx.feature;
  if (ctx.workspaceId) tags.workspace_id = ctx.workspaceId;
  if (ctx.userId) tags.user_id = ctx.userId;
  if (ctx.contentItemId) tags.content_item_id = ctx.contentItemId;

  // Extra context (non-indexed detail)
  const { route, feature, workspaceId, userId, contentItemId, fingerprint, severity: _sev, ...extra } = ctx;

  if (sentryActive) {
    Sentry.withScope((scope) => {
      scope.setTags(tags);
      scope.setLevel(severity);
      if (fingerprint) scope.setFingerprint(fingerprint);
      if (ctx.userId) scope.setUser({ id: ctx.userId });
      scope.setExtra('context', { route, feature, workspaceId, userId, contentItemId, ...extra });
      Sentry.captureException(err);
    });
  }

  // Always log to console for Vercel Function Logs
  console.error(`[RouteError] ${ctx.route}${ctx.feature ? `:${ctx.feature}` : ''}:`, err.message, tags);
}

export default reportError;
