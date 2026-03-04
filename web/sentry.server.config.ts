/**
 * Sentry server-side configuration.
 * Loaded via instrumentation.ts register() hook.
 * Safe no-op when SENTRY_DSN is unset.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || process.env.NEXT_PUBLIC_APP_VERSION || undefined,

    // Performance — lighter sampling on server
    tracesSampleRate: 0.05,

    // Filter transient server errors
    ignoreErrors: [
      'ECONNRESET',
      'EPIPE',
      'fetch failed',
      /socket hang up/,
    ],
  });
}
