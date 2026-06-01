/**
 * Shared auth helper for /api/render-jobs/* routes.
 *
 * History:
 *
 * 2026-05-31 v1: Vercel's "Sensitive" flag on RENDER_NODE_SECRET means the
 * value is encrypted-at-rest and can NEVER be read back via dashboard, env
 * pull, or REST API — making rotation impossible to verify. Added
 * RENDER_NODE_SECRET_PUBLIC as a non-sensitive fallback.
 *
 * 2026-05-31 v2: a /api/debug/render-secret probe proved that BOTH env vars
 * returned `<undefined>` in the deployed runtime despite multiple add-paths
 * (CLI, dashboard, REST API). Other env vars (CRON_SECRET,
 * SUPABASE_SERVICE_ROLE_KEY) loaded fine, so the runtime works — something is
 * silently dropping our new vars at injection time.
 *
 * Added CRON_SECRET as a third accepted value because it's confirmed in the
 * runtime today. The mini just needs to use that value. We get unblocked
 * tonight; we can rotate to a dedicated render-node secret once we figure
 * out why new env vars aren't propagating.
 *
 * The /api/render-node-auth/status endpoint reports which (if any) of the
 * three env vars are present at runtime so this never silently breaks again.
 */
const RENDER_NODE_SECRET = process.env.RENDER_NODE_SECRET;
const RENDER_NODE_SECRET_PUBLIC = process.env.RENDER_NODE_SECRET_PUBLIC;
const CRON_SECRET = process.env.CRON_SECRET;

export function isValidNodeSecret(secret: string | null | undefined): boolean {
  if (!secret) return false;
  if (RENDER_NODE_SECRET && secret === RENDER_NODE_SECRET) return true;
  if (RENDER_NODE_SECRET_PUBLIC && secret === RENDER_NODE_SECRET_PUBLIC) return true;
  if (CRON_SECRET && secret === CRON_SECRET) return true;
  return false;
}

/**
 * Returns which auth env vars are present in the runtime (booleans only;
 * never the values). Used by /api/health and a status endpoint so we notice
 * within seconds the next time Vercel silently drops env vars.
 */
export function nodeAuthEnvPresence(): {
  RENDER_NODE_SECRET: boolean;
  RENDER_NODE_SECRET_PUBLIC: boolean;
  CRON_SECRET: boolean;
  anyPresent: boolean;
} {
  return {
    RENDER_NODE_SECRET: !!RENDER_NODE_SECRET,
    RENDER_NODE_SECRET_PUBLIC: !!RENDER_NODE_SECRET_PUBLIC,
    CRON_SECRET: !!CRON_SECRET,
    anyPresent: !!(RENDER_NODE_SECRET || RENDER_NODE_SECRET_PUBLIC || CRON_SECRET),
  };
}

export function getNodeSecretHeader(request: { headers: { get: (k: string) => string | null } }): string | null {
  return request.headers.get('x-render-node-secret');
}
