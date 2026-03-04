/**
 * POST /api/intake/google/disconnect
 * Revokes Google Drive tokens and marks connector as DISCONNECTED.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { revokeAndDelete } from '@/lib/intake/google-drive';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await revokeAndDelete(authContext.user.id);
    return NextResponse.json({ ok: true, status: 'DISCONNECTED' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
