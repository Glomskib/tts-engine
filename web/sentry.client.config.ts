/**
 * Sentry client-side configuration.
 * Loaded automatically by @sentry/nextjs instrumentation.
 * Safe no-op when SENTRY_DSN is unset.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'development',
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || process.env.NEXT_PUBLIC_APP_VERSION || undefined,

    // Performance
    tracesSampleRate: 0.1, // 10% of transactions in production
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.5,

    // Filter noisy errors
    ignoreErrors: [
      'ResizeObserver loop',
      'Non-Error promise rejection captured',
      'AbortError',
      /Loading chunk \d+ failed/,
    ],

    beforeSend(event) {
      // Strip PII from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(b => {
          if (b.data?.url) {
            try {
              const u = new URL(String(b.data.url));
              u.searchParams.delete('token');
              u.searchParams.delete('key');
              b.data.url = u.toString();
            } catch { /* keep as-is */ }
          }
          return b;
        });
      }
      return event;
    },
  });
}
