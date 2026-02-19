/**
 * Owner-only guard for Command Center.
 *
 * Returns 404 (not 401/403) for non-owners to keep the section hidden.
 * Checks OWNER_EMAILS env var (comma-separated), defaults to spiderbuttons@gmail.com.
 *
 * Server-side usage in API routes:
 *   const ownerCheck = await requireOwner(request);
 *   if (ownerCheck) return ownerCheck; // 404 response
 *
 * Server component usage:
 *   const isOwner = await checkIsOwner();
 *   if (!isOwner) notFound();
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

const DEFAULT_OWNER = 'spiderbuttons@gmail.com';

function getOwnerEmails(): Set<string> {
  const raw = process.env.OWNER_EMAILS || DEFAULT_OWNER;
  return new Set(
    raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  );
}

/**
 * Check if a given email is an owner.
 */
export function isOwnerEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return getOwnerEmails().has(email.toLowerCase());
}

/**
 * Server-side guard for API routes.
 * Returns a 404 NextResponse if the caller is not the owner,
 * or null if they are (i.e., allowed to proceed).
 */
export async function requireOwner(request: Request): Promise<NextResponse | null> {
  const auth = await getApiAuthContext(request);

  if (!auth.user || !isOwnerEmail(auth.user.email)) {
    // Return 404 to hide the endpoint
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  return null; // owner confirmed
}

/**
 * Server component / server action check.
 * Uses cookie-based session (no request object needed).
 */
export async function checkIsOwner(): Promise<boolean> {
  const auth = await getApiAuthContext();
  return !!auth.user && isOwnerEmail(auth.user.email);
}
