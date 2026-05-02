/**
 * /api/orgs/current — return the active org + member roster.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentOrgId, MULTI_TENANCY_ENABLED } from '@/lib/auth/current-org';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const ctx = await getCurrentOrgId();
  if (!ctx.orgId) {
    return NextResponse.json({ ok: false, error: 'no org' }, { status: 404 });
  }

  const { data: orgRow } = await supabaseAdmin
    .from('organizations')
    .select('id, name, type, plan_tier, is_personal')
    .eq('id', ctx.orgId)
    .maybeSingle();

  if (!orgRow) {
    return NextResponse.json({ ok: false, error: 'org not found' }, { status: 404 });
  }

  // Member list with email — pulled via RPC since auth.users isn't directly
  // SELECTable from the client. We query auth.users via supabaseAdmin
  // (service role).
  const { data: memberRows } = await supabaseAdmin
    .from('organization_members')
    .select('user_id, role, joined_at')
    .eq('org_id', ctx.orgId);

  const userIds = (memberRows || []).map((r) => r.user_id);
  let emails: Record<string, string> = {};
  if (userIds.length) {
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({
      page: 1, perPage: 200,
    });
    emails = Object.fromEntries(
      users.filter((u) => userIds.includes(u.id)).map((u) => [u.id, u.email || '']),
    );
  }

  const members = (memberRows || []).map((r) => ({
    user_id: r.user_id,
    email: emails[r.user_id] || '(unknown)',
    role: r.role,
    joined_at: r.joined_at,
  }));

  return NextResponse.json({
    ok: true,
    org: { ...orgRow, multi_tenancy_enabled: MULTI_TENANCY_ENABLED },
    members,
  });
}
