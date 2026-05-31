/**
 * Shared auth helper for /api/render-jobs/* routes.
 *
 * 2026-05-31: Vercel's "Sensitive" flag on RENDER_NODE_SECRET means the value
 * is encrypted-at-rest and can NEVER be read back via the dashboard, `vercel
 * env pull`, or the REST API. That made rotation impossible to verify — we
 * spent hours chasing whether the value on the mini matched the value Vercel
 * had stored, with no way to confirm.
 *
 * Fix: accept either env var. Set RENDER_NODE_SECRET_PUBLIC (NOT sensitive) so
 * we can verify it via env pull and keep mini + prod in sync. RENDER_NODE_SECRET
 * is still honored for backward compatibility.
 */
const RENDER_NODE_SECRET = process.env.RENDER_NODE_SECRET;
const RENDER_NODE_SECRET_PUBLIC = process.env.RENDER_NODE_SECRET_PUBLIC;

export function isValidNodeSecret(secret: string | null | undefined): boolean {
  if (!secret) return false;
  if (RENDER_NODE_SECRET && secret === RENDER_NODE_SECRET) return true;
  if (RENDER_NODE_SECRET_PUBLIC && secret === RENDER_NODE_SECRET_PUBLIC) return true;
  return false;
}

export function getNodeSecretHeader(request: { headers: { get: (k: string) => string | null } }): string | null {
  return request.headers.get('x-render-node-secret');
}
