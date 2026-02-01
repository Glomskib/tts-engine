/**
 * Error tracking utility for production error monitoring.
 *
 * In production, replace the console.error with actual error tracking:
 * - Sentry: Sentry.captureException(error, { extra: context })
 * - LogRocket: LogRocket.captureException(error)
 * - Datadog: datadogRum.addError(error, context)
 */

interface ErrorContext {
  componentStack?: string;
  userId?: string;
  page?: string;
  action?: string;
  [key: string]: unknown;
}

export function reportError(error: Error, context?: ErrorContext) {
  // Add common context
  const enrichedContext = {
    ...context,
    timestamp: new Date().toISOString(),
    url: typeof window !== 'undefined' ? window.location.href : 'server',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
  };

  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', error);
    console.error('Context:', enrichedContext);
    return;
  }

  // Production: Log to console for now
  // TODO: Replace with actual error tracking service
  console.error('[Production Error]', error.message, enrichedContext);

  // Example Sentry integration:
  // import * as Sentry from '@sentry/nextjs';
  // Sentry.captureException(error, { extra: enrichedContext });
}

/**
 * Report a warning (non-fatal issue)
 */
export function reportWarning(message: string, context?: ErrorContext) {
  const enrichedContext = {
    ...context,
    timestamp: new Date().toISOString(),
    level: 'warning',
  };

  if (process.env.NODE_ENV === 'development') {
    console.warn('Warning:', message, enrichedContext);
    return;
  }

  console.warn('[Production Warning]', message, enrichedContext);
}

/**
 * Report a custom event/metric
 */
export function reportEvent(name: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'development') {
    console.log('Event:', name, data);
    return;
  }

  // Example: Track important user actions
  console.log('[Event]', name, data);
}

export default reportError;
