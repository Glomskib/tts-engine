/**
 * GET /api/credits/balance — current user's credit state for the /create header.
 *
 * Returns: { ok, remaining, isUnlimited, plan }
 * Admins return { isUnlimited: true } regardless of stored balance.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { ensureUserCredits, checkCredits } from '@/lib/credits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  await ensureUserCredits(auth.user.id);
  const result = await checkCredits(auth.user.id, !!auth.isAdmin);

  return NextResponse.json({
    ok: true,
    remaining: result.remaining,
    isUnlimited: result.isUnlimited,
    plan: result.plan,
    hasCredits: result.hasCredits,
  });
}
