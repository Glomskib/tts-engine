/**
 * /api/orgs/me — list orgs the current user is a member of, plus the active one.
 * Hidden behind ENABLE_MULTI_TENANCY in the UI; the route is always callable
 * but returns just the personal org when the flag is off.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentOrgId } from '@/lib/auth/current-org';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const { data: memberships, error } = await supabaseAdmin
    .from('organization_members')
    .select('org_id, role')
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const orgIds = (memberships || []).map((m) => m.org_id);
  let orgs: Array<{ id: string; name: string; type: string; is_personal: boolean; role: string }> = [];
  if (orgIds.length > 0) {
    const { data: orgRows } = await supabaseAdmin
      .from('organizations')
      .select('id, name, type, is_personal')
      .in('id', orgIds);
    const byId = new Map((orgRows || []).map((o) => [o.id, o]));
    orgs = (memberships || []).flatMap((m) => {
      const o = byId.get(m.org_id);
      if (!o) return [];
      return [{
        id: o.id, name: o.name, type: o.type, is_personal: o.is_personal,
        role: m.role,
      }];
    });
  }

  const ctx = await getCurrentOrgId();

  return NextResponse.json({
    ok: true,
    orgs,
    active_org_id: ctx.orgId,
  });
}
