/**
 * GET /api/intake/google/connect
 * Redirects user to Google OAuth consent screen.
 * Stores user ID in state param for callback.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { getAuthUrl } from '@/lib/intake/google-drive';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // State encodes user ID for callback verification
    const state = Buffer.from(JSON.stringify({
      userId: authContext.user.id,
      ts: Date.now(),
    })).toString('base64url');

    const url = getAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
