/**
 * Next.js instrumentation hook.
 * Imports Sentry server/edge configs on startup.
 * Safe no-op when @sentry/nextjs DSN is unset.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');

    // Validate required env vars at boot — logs warnings, never crashes
    const { validateBootEnvVars } = await import('./lib/env-validation');
    validateBootEnvVars();
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = async (
  ..._args: unknown[]
) => {
  // Sentry's Next.js SDK auto-captures request errors when initialized.
  // This hook exists as a placeholder for custom request error handling.
};
