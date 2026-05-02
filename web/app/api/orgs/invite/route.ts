/**
 * /api/orgs/invite — invite a teammate by email.
 *
 * Inserts a row in `organization_invites` with a unique token. Sending the
 * actual email is gated on Resend being wired up; for now we just return
 * the invite URL so the caller can share manually if needed.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireOrgRole, InsufficientOrgRoleError, NotAuthenticatedError } from '@/lib/auth/current-org';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireOrgRole('admin');
  } catch (err) {
    if (err instanceof NotAuthenticatedError) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    if (err instanceof InsufficientOrgRoleError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: 'unknown' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = typeof body?.role === 'string' ? body.role : 'editor';

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'invalid email' }, { status: 400 });
  }
  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return NextResponse.json({ ok: false, error: 'invalid role' }, { status: 400 });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 14 * 86400 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('organization_invites')
    .upsert(
      {
        org_id: ctx.orgId,
        email,
        role,
        token,
        expires_at: expires,
      },
      { onConflict: 'org_id,email' },
    )
    .select('id, token')
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message || 'insert failed' }, { status: 500 });
  }

  // TODO: wire to Resend (lib/resend.ts pattern — not done here to keep scope tight)
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://flashflowai.com'}/invite/${data.token}`;
  return NextResponse.json({ ok: true, inviteUrl });
}
