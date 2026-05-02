/**
 * /api/orgs/switch — set the active org cookie.
 *
 * Body: { orgId: string }. Verifies the user is a member before writing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { ORG_COOKIE } from '@/lib/auth/current-org';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const orgId = typeof body?.orgId === 'string' ? body.orgId : null;
  if (!orgId) {
    return NextResponse.json({ ok: false, error: 'orgId required' }, { status: 400 });
  }

  const { data: membership } = await supabaseAdmin
    .from('organization_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ ok: false, error: 'not a member' }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ORG_COOKIE, orgId, {
    path: '/',
    httpOnly: false, // read on client for UX continuity, never used for auth
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
