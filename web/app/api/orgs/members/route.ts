/**
 * /api/orgs/members — PATCH (role change) and DELETE (remove member).
 * Both require admin role on the active org. Owner role cannot be changed
 * or removed via this endpoint — owner transfer is a separate flow.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireOrgRole, InsufficientOrgRoleError, NotAuthenticatedError } from '@/lib/auth/current-org';

export const runtime = 'nodejs';

async function adminGuard() {
  try {
    return await requireOrgRole('admin');
  } catch (err) {
    if (err instanceof NotAuthenticatedError) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    if (err instanceof InsufficientOrgRoleError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: 'unknown' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const ctx = await adminGuard();
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const userId = typeof body?.user_id === 'string' ? body.user_id : null;
  const role = typeof body?.role === 'string' ? body.role : null;

  if (!userId || !role || !['admin', 'editor', 'viewer'].includes(role)) {
    return NextResponse.json({ ok: false, error: 'invalid input' }, { status: 400 });
  }

  // Don't allow owner role change here.
  const { data: target } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', ctx.orgId)
    .eq('user_id', userId)
    .maybeSingle();
  if (target?.role === 'owner') {
    return NextResponse.json({ ok: false, error: 'cannot change owner role here' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('organization_members')
    .update({ role })
    .eq('org_id', ctx.orgId)
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const ctx = await adminGuard();
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const userId = typeof body?.user_id === 'string' ? body.user_id : null;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'user_id required' }, { status: 400 });
  }

  const { data: target } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', ctx.orgId)
    .eq('user_id', userId)
    .maybeSingle();
  if (target?.role === 'owner') {
    return NextResponse.json({ ok: false, error: 'cannot remove owner' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('organization_members')
    .delete()
    .eq('org_id', ctx.orgId)
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
