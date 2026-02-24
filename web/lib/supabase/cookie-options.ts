/**
 * Shared Supabase cookie attributes.
 *
 * Applied to every createServerClient call — in server components,
 * route handlers, AND middleware — so all routes produce cookies with
 * identical attributes. Mobile Safari / Chrome require consistency.
 *
 * NOTE: `name` / storageKey is intentionally NOT set here; the default
 * of `sb-<project-ref>-auth-token` is already consistent because every
 * call uses the same NEXT_PUBLIC_SUPABASE_URL. Setting a custom name
 * would rename the cookie and invalidate every live session.
 */
export const SUPABASE_COOKIE_OPTIONS = {
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;
